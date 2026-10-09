package com.bofa.olb.api;

import com.bofa.olb.api.dto.AccountResponse;
import com.bofa.olb.api.dto.QuoteResponse;
import com.bofa.olb.api.dto.TransferResponse;
import com.bofa.olb.application.Messages;
import com.bofa.olb.domain.Codes;
import com.bofa.olb.domain.Money;
import com.bofa.olb.domain.Transfer;
import com.bofa.olb.domain.TransferQuote;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

@Component
public class ApiMapper {

    /** Legacy TransferQuoteAction / confirm.jsp: "Tue, Oct 13, 2026". */
    public static final DateTimeFormatter DISPLAY_DATE = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.US);

    private final Messages messages;

    public ApiMapper(Messages messages) { this.messages = messages; }

    public QuoteResponse quote(TransferQuote q) {
        return new QuoteResponse(true, q.from().displayName(), q.to().displayName(), Money.format(q.amountCents()),
                q.feeDisplay(), Money.format(q.totalDebitCents()), messages.typeLabel(q.typeCode()),
                messages.tierLabel(q.tierCode()), DISPLAY_DATE.format(q.deliveryDate()),
                q.from().accountId(), q.to().accountId(), q.amountCents(), q.feeCents(), q.totalDebitCents(),
                q.typeCode(), q.tierCode(), q.frequencyCode(), messages.frequencyLabel(q.frequencyCode()),
                q.scheduledDate(), q.deliveryDate());
    }

    public TransferResponse transfer(Transfer t, List<AccountResponse> accounts) {
        boolean internal = Codes.TYPE_INTERNAL.equals(t.typeCode());
        return new TransferResponse(t.confirmationNumber().trim(), t.statusCode(), messages.statusLabel(t.statusCode()),
                t.scheduledDate(), t.postDate(), DISPLAY_DATE.format(t.postDate()),
                t.fromDisplay(), t.toDisplay(), t.fromAccountId(), t.toAccountId(),
                t.amountCents(), Money.format(t.amountCents()), t.feeCents(),
                t.feeCents() == 0 ? "No fee" : Money.format(t.feeCents()),
                t.totalDebitCents(), Money.format(t.totalDebitCents()),
                t.typeCode(), messages.typeLabel(t.typeCode()), t.tierCode(), messages.tierLabel(t.tierCode()),
                t.frequencyCode(), messages.frequencyLabel(t.frequencyCode()), t.memo(), t.createdTs(),
                accounts == null ? null : messages.get("xfr.confirm.heading"),
                accounts == null ? null : messages.get(internal ? "xfr.confirm.sameday" : "xfr.confirm.external"),
                accounts);
    }

    public static String displayDate(LocalDate d) { return DISPLAY_DATE.format(d); }
}
