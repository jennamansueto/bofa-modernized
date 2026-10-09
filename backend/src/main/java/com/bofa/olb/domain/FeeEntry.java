package com.bofa.olb.domain;

/** One OLB_FEE_SCHED row (cents). */
public record FeeEntry(long feeCents, long dailyLimitCents, long perTxnLimitCents) {}
