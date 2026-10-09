package com.bofa.olb.application;

import com.bofa.olb.domain.Account;
import com.bofa.olb.domain.BusinessCalendar;
import com.bofa.olb.domain.Codes;
import com.bofa.olb.domain.Customer;
import com.bofa.olb.domain.FeeEntry;
import com.bofa.olb.domain.Money;
import com.bofa.olb.domain.Transfer;
import com.bofa.olb.domain.TransferQuote;
import com.bofa.olb.domain.TransferValidationException;
import com.bofa.olb.infrastructure.config.OlbProperties;
import com.bofa.olb.infrastructure.persistence.AccountRepository;
import com.bofa.olb.infrastructure.persistence.FeeScheduleRepository;
import com.bofa.olb.infrastructure.persistence.HolidayRepository;
import com.bofa.olb.infrastructure.persistence.TransferRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Port of legacy service/TransferService. Rule order, messages and quirks are preserved exactly
 * (doc 01 §5/§7); only the persistence plumbing changed.
 */
@Service
public class TransferService {

    private static final Logger log = LoggerFactory.getLogger(TransferService.class);
    private static final DateTimeFormatter FORM_DATE = DateTimeFormatter.ofPattern("MM/dd/uuuu", Locale.US)
            .withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter CONF_DATE = DateTimeFormatter.ofPattern("yyMMdd", Locale.US);

    private final AccountRepository accounts;
    private final TransferRepository transfers;
    private final FeeScheduleRepository fees;
    private final HolidayRepository holidays;
    private final OlbProperties props;
    private final Clock clock;

    public TransferService(AccountRepository accounts, TransferRepository transfers, FeeScheduleRepository fees,
                           HolidayRepository holidays, OlbProperties props, Clock clock) {
        this.accounts = accounts;
        this.transfers = transfers;
        this.fees = fees;
        this.holidays = holidays;
        this.props = props;
        this.clock = clock;
    }

    public record Request(String fromAccountId, String toAccountId, String amount, String tierCode, String delivery,
                          String frequency, String scheduledDate, String memo) {}

    public BusinessCalendar calendar() {
        return new BusinessCalendar(holidays.findAll(), props.cutoffHour(), clock, props.businessZone());
    }

    public List<Account> accountsFor(Customer cust) {
        return accounts.findOpenByCustomer(cust.customerId());
    }

    public List<Transfer> history(Customer cust) {
        return transfers.findRecent(cust.customerId(), props.historyLimit());
    }

    public Optional<Transfer> find(Customer cust, String confirmation) {
        return transfers.findByConfirmation(cust.customerId(), confirmation);
    }

    @Transactional(readOnly = true)
    public TransferQuote quote(Customer cust, Request r) {
        return buildQuote(cust, r, calendar());
    }

    @Transactional
    public Transfer submit(Customer cust, Request r) {
        BusinessCalendar cal = calendar();
        TransferQuote q = buildQuote(cust, r, cal);
        LocalDate today = cal.today();
        String memo = r.memo() == null || r.memo().isBlank() ? null : r.memo().trim();
        String conf = buildConfirmationNumber(today);                 // sequence keyed on today's ET date, not sched_dt
        boolean postNow = q.isInternal() && q.scheduledDate().equals(today);
        String status = postNow ? Codes.STATUS_POSTED : Codes.STATUS_SCHEDULED;
        Transfer t = new Transfer(null, conf, cust.customerId(), q.from().accountId(), q.to().accountId(),
                q.amountCents(), q.feeCents(), q.typeCode(), q.tierCode(), q.frequencyCode(), q.scheduledDate(),
                q.deliveryDate(), status, memo, OffsetDateTime.now(clock), q.from().displayName(), q.to().displayName());
        if (postNow) {
            accounts.adjustBalance(t.fromAccountId(), -t.totalDebitCents(), -t.totalDebitCents());
            accounts.adjustBalance(t.toAccountId(), t.amountCents(), t.amountCents());
        } else if (t.isExternal() && !q.from().isExternal()) {
            // ACH debit: hold available funds now, ledger balance moves at settlement (legacy TransferService:L105-L110)
            accounts.adjustBalance(t.fromAccountId(), 0, -t.totalDebitCents());
        }
        long id = transfers.insert(t);
        log.info("Transfer {} {} cust={} {}->{} amt={} fee={} typ={}", conf, status, cust.customerId(),
                t.fromAccountId(), t.toAccountId(), t.amountCents(), t.feeCents(), t.typeCode());
        return new Transfer(id, t.confirmationNumber(), t.customerId(), t.fromAccountId(), t.toAccountId(),
                t.amountCents(), t.feeCents(), t.typeCode(), t.tierCode(), t.frequencyCode(), t.scheduledDate(),
                t.postDate(), t.statusCode(), t.memo(), t.createdTs(), t.fromDisplay(), t.toDisplay());
    }

    private TransferQuote buildQuote(Customer cust, Request r, BusinessCalendar cal) {
        // R1 amount
        if (r.amount() == null || r.amount().isBlank()) throw new TransferValidationException("error.xfr.amount.required");
        Long cents = Money.parseToCents(r.amount());
        if (cents == null) throw new TransferValidationException("error.xfr.amount.invalid");
        if (cents <= 0) throw new TransferValidationException("error.xfr.amount.min");

        // R2 accounts
        String fromId = r.fromAccountId();
        String toId = r.toAccountId();
        if (fromId == null || toId == null) throw new TransferValidationException("error.xfr.acct.invalid");
        if (fromId.equals(toId)) throw new TransferValidationException("error.xfr.sameacct");
        Account from = accounts.findById(fromId).orElse(null);
        Account to = accounts.findById(toId).orElse(null);
        if (from == null || to == null || from.customerId() != cust.customerId() || to.customerId() != cust.customerId()) {
            throw new TransferValidationException("error.xfr.acct.invalid");
        }
        if (from.isExternal() && to.isExternal()) throw new TransferValidationException("error.xfr.ext2ext");

        // tier (submitted value is trusted — AC-20) and frequency
        String tierCode = r.tierCode();
        if (!Codes.isValidTier(tierCode)) throw new TransferValidationException("error.xfr.tier.invalid");
        String frequency = r.frequency();
        if (!Codes.isValidFrequency(frequency)) throw new TransferValidationException("error.xfr.frequency.invalid");

        LocalDate today = cal.today();
        LocalDate sched = parseScheduled(r.scheduledDate(), today);
        if (sched.isBefore(today)) throw new TransferValidationException("error.xfr.date.past");

        // R3 type
        String type = Codes.deriveType(from.isExternal(), to.isExternal(), r.delivery());

        // R4 fee / limits
        FeeEntry fee = fees.lookup(type, tierCode, today)
                .orElseThrow(() -> new TransferValidationException("error.xfr.tier.invalid"));
        long perTxn = Codes.TYPE_INTERNAL.equals(type) ? props.internalPerTxnCapCents() : fee.perTxnLimitCents();
        if (cents > perTxn) {
            throw new TransferValidationException("error.xfr.pertxn", Money.format(perTxn));
        }
        if (!Codes.TYPE_INTERNAL.equals(type)) {
            long usedToday = transfers.sumExternalForDay(cust.customerId(), today);
            if (sched.equals(today) && usedToday + cents > fee.dailyLimitCents()) {
                throw new TransferValidationException("error.xfr.daily", Money.format(fee.dailyLimitCents()),
                        Money.format(usedToday));
            }
        }

        // R5 funds
        if (!from.isExternal() && cents + fee.feeCents() > from.availableBalanceCents()) {
            throw new TransferValidationException("error.xfr.nsf");
        }

        // R6 Reg D (counts the scheduled month, inbound-from-savings irrelevant: from_account only)
        if (from.isSavings()) {
            int n = transfers.countOutboundInMonth(fromId, BusinessCalendar.firstOfMonth(sched),
                    BusinessCalendar.firstOfNextMonth(sched));
            if (n >= props.regDMonthlyLimit()) throw new TransferValidationException("error.xfr.regd");
        }

        // R7 delivery date
        LocalDate delivery;
        if (Codes.TYPE_INTERNAL.equals(type)) {
            delivery = sched;
        } else {
            boolean afterCutoff = sched.equals(today) && cal.isAfterCutoff();
            LocalDate start = cal.effectiveStartDate(sched, afterCutoff);
            delivery = cal.addBusinessDays(start, Codes.TYPE_EXT_NEXT_DAY.equals(type) ? 1 : 3);
        }
        return new TransferQuote(type, cents, fee.feeCents(), sched, delivery, tierCode, frequency, from, to);
    }

    /** Blank -> today; otherwise strict MM/dd/yyyy (legacy SimpleDateFormat lenient=false). ISO yyyy-MM-dd also accepted. */
    static LocalDate parseScheduled(String raw, LocalDate today) {
        if (raw == null || raw.isBlank()) return today;
        String s = raw.trim();
        try {
            return LocalDate.parse(s, FORM_DATE);
        } catch (DateTimeParseException e) {
            try {
                return LocalDate.parse(s);
            } catch (DateTimeParseException e2) {
                throw new TransferValidationException("error.xfr.date.invalid");
            }
        }
    }

    private String buildConfirmationNumber(LocalDate today) {
        int seq = transfers.nextConfirmationSeq(today);
        return "XFR" + CONF_DATE.format(today) + "-" + String.format("%06d", seq);
    }
}
