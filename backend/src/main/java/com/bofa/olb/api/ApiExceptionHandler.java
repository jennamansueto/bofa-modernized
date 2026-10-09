package com.bofa.olb.api;

import com.bofa.olb.api.dto.ApiError;
import com.bofa.olb.application.AuthenticationFailedException;
import com.bofa.olb.application.Messages;
import com.bofa.olb.application.NotFoundException;
import com.bofa.olb.domain.TransferValidationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final Messages messages;

    public ApiExceptionHandler(Messages messages) { this.messages = messages; }

    @ExceptionHandler(TransferValidationException.class)
    public ResponseEntity<ApiError> validation(TransferValidationException e) {
        return body(HttpStatus.UNPROCESSABLE_ENTITY, e.getCode(), messages.get(e.getCode(), e.getArgs()));
    }

    @ExceptionHandler(AuthenticationFailedException.class)
    public ResponseEntity<ApiError> auth(AuthenticationFailedException e) {
        return body(HttpStatus.UNAUTHORIZED, e.getCode(), messages.get(e.getCode()));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> notFound(NotFoundException e) {
        return body(HttpStatus.NOT_FOUND, e.getMessage(), messages.get(e.getMessage()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> noResource(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(404, "NOT_FOUND", "No such resource."));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(ApiError.of(400, "BAD_REQUEST", "Malformed JSON request body."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> other(Exception e) {
        String ref = "ERR-" + Long.toHexString(System.currentTimeMillis());
        log.error("Unhandled error {}", ref, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiError.of(500, "INTERNAL_ERROR",
                "We're sorry, Online Banking is temporarily unavailable. Error reference: " + ref));
    }

    private ResponseEntity<ApiError> body(HttpStatus status, String key, String message) {
        return ResponseEntity.status(status).body(ApiError.of(status.value(), Messages.codeFor(key), message));
    }
}
