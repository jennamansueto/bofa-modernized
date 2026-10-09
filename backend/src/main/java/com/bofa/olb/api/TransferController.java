package com.bofa.olb.api;

import com.bofa.olb.api.dto.AccountResponse;
import com.bofa.olb.api.dto.ApiError;
import com.bofa.olb.api.dto.QuoteResponse;
import com.bofa.olb.api.dto.TransferRequest;
import com.bofa.olb.api.dto.TransferResponse;
import com.bofa.olb.application.NotFoundException;
import com.bofa.olb.application.TransferService;
import com.bofa.olb.domain.Customer;
import com.bofa.olb.domain.Transfer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/secure")
@Tag(name = "Transfers", description = "Accounts, quotes, submissions and history for the signed-in customer")
public class TransferController {

    private final TransferService transfers;
    private final CurrentCustomer current;
    private final ApiMapper mapper;

    public TransferController(TransferService transfers, CurrentCustomer current, ApiMapper mapper) {
        this.transfers = transfers;
        this.current = current;
        this.mapper = mapper;
    }

    @Operation(summary = "Accounts", description = "Active accounts ordered by seq_no with current and available balances (AC-11).")
    @GetMapping("/accounts")
    public List<AccountResponse> accounts() {
        return accountsFor(current.get());
    }

    @Operation(summary = "Recent activity", description = "Last 10 transfers ordered by crt_ts DESC, transfer_id DESC (AC-12).")
    @GetMapping("/transfers")
    public List<TransferResponse> history() {
        return transfers.history(current.get()).stream().map(t -> mapper.transfer(t, null)).toList();
    }

    @Operation(summary = "Transfer by confirmation number", description = "Scoped to the signed-in customer; other customers' numbers are 404.")
    @ApiResponse(responseCode = "404", content = @Content(schema = @Schema(implementation = ApiError.class)))
    @GetMapping("/transfers/{confirmation}")
    public TransferResponse byConfirmation(@PathVariable String confirmation) {
        Transfer t = transfers.find(current.get(), confirmation.trim().toUpperCase())
                .orElseThrow(() -> new NotFoundException("error.xfr.notfound"));
        return mapper.transfer(t, null);
    }

    @Operation(summary = "Quote (preview) a transfer", description = "Legacy /secure/quote.do: validates and prices without persisting. "
            + "Validation failures are HTTP 422 with the verbatim legacy message (valid JSON even for the daily-limit case).")
    @ApiResponse(responseCode = "200", description = "Priced quote")
    @ApiResponse(responseCode = "422", content = @Content(schema = @Schema(implementation = ApiError.class)))
    @PostMapping("/transfers/quote")
    public QuoteResponse quote(@RequestBody TransferRequest body) {
        return mapper.quote(transfers.quote(current.get(), toRequest(body)));
    }

    @Operation(summary = "Submit a transfer", description = "Legacy /secure/transferSubmit.do: re-validates, allocates XFRyyMMdd-nnnnnn, "
            + "posts (INT today) or schedules, and returns the confirmation plus updated balances.")
    @ApiResponse(responseCode = "201", description = "Transfer created")
    @ApiResponse(responseCode = "422", content = @Content(schema = @Schema(implementation = ApiError.class)))
    @PostMapping("/transfers")
    public ResponseEntity<TransferResponse> submit(@RequestBody TransferRequest body) {
        Customer cust = current.get();
        Transfer t = transfers.submit(cust, toRequest(body));
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.transfer(t, accountsFor(cust)));
    }

    private List<AccountResponse> accountsFor(Customer cust) {
        return transfers.accountsFor(cust).stream().map(AccountResponse::from).toList();
    }

    private static TransferService.Request toRequest(TransferRequest b) {
        return new TransferService.Request(b.fromAccountId(), b.toAccountId(), b.amount(), b.tierCode(),
                b.deliveryOrDefault(), b.frequencyOrDefault(), b.scheduledDate(), b.memo());
    }
}
