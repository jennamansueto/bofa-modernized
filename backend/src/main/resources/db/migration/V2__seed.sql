-- V2__seed.sql — reproduces bofa-portal src/main/resources/sql/seed.sql exactly except password hashing.
-- Legacy run.sh sets -Duser.timezone=America/New_York, so legacy TIMESTAMP literals are ET wall-clock:
-- they are written here with an explicit offset (EDT = -04:00 for Sept/Oct 2026).

-- Customers (seed.sql:1-5). Password for both: Password1 (bcrypt cost 12).
INSERT INTO olb_customer (customer_id, user_id, password_hash, first_name, last_name, rel_tier_cd, last_login_ts, fail_cnt, stat_cd) VALUES
 (100042, 'demo.user', '$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy', 'Jordan', 'Rivera', '10', NULL, 0, 'A'),
 (100077, 'sam.chen',  '$2a$12$mizW3tD8IJ6jX/laR1Cr6euXdSBYdIvXf9jhmpxac22ssdhttgDAy', 'Sam',    'Chen',   '00', NULL, 0, 'A');

-- Accounts (seed.sql:7-12)
INSERT INTO olb_account (account_id, customer_id, acct_typ_cd, product_name, acct_nbr_last4, cur_bal_cents, avl_bal_cents, ext_bank_name, seq_no, stat_cd) VALUES
 ('ACCT-1001', 100042, 'DDA', 'Advantage Plus Banking - Checking', '1001',  421538,  421538, NULL,                        1, 'A'),
 ('ACCT-1002', 100042, 'SAV', 'Advantage Savings',                 '1002', 1294000, 1294000, NULL,                        2, 'A'),
 ('ACCT-1003', 100042, 'EXT', 'Chase Total Checking',              '4432',       0,       0, 'JPMorgan Chase Bank, N.A.', 3, 'A'),
 ('ACCT-2001', 100077, 'DDA', 'Advantage SafeBalance Banking',     '2001',   88012,   88012, NULL,                        1, 'A'),
 ('ACCT-2002', 100077, 'SAV', 'Advantage Savings',                 '2002',  250000,  250000, NULL,                        2, 'A');

-- Fee schedule (seed.sql:14-27). All amounts in cents.
INSERT INTO olb_fee_schedule (xfr_typ_cd, rel_tier_cd, fee_cents, daily_lim_cents, per_txn_lim_cents, eff_dt) VALUES
 ('INT', '00',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '10',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '20',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('INT', '30',   0, 99999999, 9999999, DATE '2019-01-01'),
 ('EXS', '00',   0,   350000,  350000, DATE '2019-01-01'),
 ('EXS', '10',   0,   500000,  500000, DATE '2019-01-01'),
 ('EXS', '20',   0,  1000000, 1000000, DATE '2019-01-01'),
 ('EXS', '30',   0,  2500000, 2500000, DATE '2019-01-01'),
 ('EXN', '00', 300,   350000,  350000, DATE '2019-01-01'),
 ('EXN', '10',   0,   500000,  500000, DATE '2019-01-01'),
 ('EXN', '20',   0,  1000000, 1000000, DATE '2019-01-01'),
 ('EXN', '30',   0,  2500000, 2500000, DATE '2019-01-01');

-- Bank holidays (seed.sql:29-51)
INSERT INTO olb_bank_holiday (holiday_dt, holiday_name) VALUES
 (DATE '2026-01-01', 'New Year''s Day'),
 (DATE '2026-01-19', 'Martin Luther King Jr. Day'),
 (DATE '2026-02-16', 'Presidents Day'),
 (DATE '2026-05-25', 'Memorial Day'),
 (DATE '2026-06-19', 'Juneteenth'),
 (DATE '2026-07-03', 'Independence Day (observed)'),
 (DATE '2026-09-07', 'Labor Day'),
 (DATE '2026-10-12', 'Columbus Day'),
 (DATE '2026-11-11', 'Veterans Day'),
 (DATE '2026-11-26', 'Thanksgiving Day'),
 (DATE '2026-12-25', 'Christmas Day'),
 (DATE '2027-01-01', 'New Year''s Day'),
 (DATE '2027-01-18', 'Martin Luther King Jr. Day'),
 (DATE '2027-02-15', 'Presidents Day'),
 (DATE '2027-05-31', 'Memorial Day'),
 (DATE '2027-06-18', 'Juneteenth (observed)'),
 (DATE '2027-07-05', 'Independence Day (observed)'),
 (DATE '2027-09-06', 'Labor Day'),
 (DATE '2027-10-11', 'Columbus Day'),
 (DATE '2027-11-11', 'Veterans Day'),
 (DATE '2027-11-25', 'Thanksgiving Day'),
 (DATE '2027-12-24', 'Christmas Day (observed)');

-- Transfer history (seed.sql:53-59). transfer_id pinned to legacy HSQLDB IDENTITY values 0,1,2.
INSERT INTO olb_transfer (transfer_id, conf_nbr, customer_id, from_account_id, to_account_id, amt_cents, fee_cents, xfr_typ_cd, rel_tier_cd, freq_cd, sched_dt, post_dt, stat_cd, memo, crt_ts, crt_chnl_cd)
OVERRIDING SYSTEM VALUE VALUES
 (0, 'XFR260928-000014', 100042, 'ACCT-1001', 'ACCT-1002',  25000, 0, 'INT', '10', 'O', DATE '2026-09-28', DATE '2026-09-28', 'P', 'Vacation fund', TIMESTAMPTZ '2026-09-28 09:12:44-04:00', 'OLB'),
 (1, 'XFR261001-000203', 100042, 'ACCT-1002', 'ACCT-1001', 120000, 0, 'INT', '10', 'M', DATE '2026-10-01', DATE '2026-10-01', 'P', 'Rent',          TIMESTAMPTZ '2026-10-01 06:00:02-04:00', 'OLB'),
 (2, 'XFR261006-000091', 100042, 'ACCT-1001', 'ACCT-1003',  50000, 0, 'EXS', '10', 'O', DATE '2026-10-06', DATE '2026-10-09', 'S', NULL,            TIMESTAMPTZ '2026-10-06 18:40:19-04:00', 'OLB');
SELECT setval(pg_get_serial_sequence('olb_transfer', 'transfer_id'), 2, true);

-- olb_confirmation_seq is intentionally empty, exactly like legacy (first transfer of any day is -000001).
