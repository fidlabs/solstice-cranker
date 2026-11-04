import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEther } from 'ethers';

import { loadConfig } from '../src/config.mjs';
import { feeGuard } from '../src/crank.mjs';

const KEY = '0x' + '11'.repeat(32);

describe('feeGuard: the per-transaction spend ceiling', () => {
  const cap = parseEther('0.1');

  it('lets a normal Filecoin crank through and reports its maximum cost', () => {
    const v = feeGuard({ gasLimit: 200_000_000n, maxFeePerGas: 2_000n, maxFeeWei: cap });
    assert.equal(v.ok, true);
    assert.equal(v.maxCostWei, 400_000_000_000n);
  });

  it('holds back a message whose gasLimit x maxFeePerGas exceeds the cap', () => {
    // A hostile node quoting 1 FIL per 1e9 gas units: the whole wallet in one call.
    const v = feeGuard({ gasLimit: 1_000_000_000n, maxFeePerGas: 1_000_000_000n, maxFeeWei: cap });
    assert.equal(v.ok, false);
    assert.match(v.message, /above the 0\.1 FIL cap/);
    assert.match(v.message, /Nothing was sent/);
  });

  it('allows exactly the cap', () => {
    assert.equal(feeGuard({ gasLimit: 1n, maxFeePerGas: cap, maxFeeWei: cap }).ok, true);
  });

  it('cannot bound a message with no estimate or no fee data, and does not block it', () => {
    assert.deepEqual(feeGuard({ gasLimit: undefined, maxFeePerGas: 10n, maxFeeWei: cap }), { ok: true, maxCostWei: null, message: null });
    assert.deepEqual(feeGuard({ gasLimit: 10n, maxFeePerGas: null, maxFeeWei: cap }), { ok: true, maxCostWei: null, message: null });
  });
});

describe('config: fee cap, confirmation timeout, Mainnet send switch', () => {
  const base = { NETWORK: 'calibnet', CRANKER_PRIVATE_KEY: KEY };

  it('defaults to a 0.1 FIL cap and an 8-minute confirmation timeout', () => {
    const c = loadConfig(base);
    assert.equal(c.maxFeeWei, parseEther('0.1'));
    assert.equal(c.txTimeoutMs, 480_000);
  });

  it('reads CRANK_MAX_FEE_FIL and CRANK_TX_TIMEOUT_MS, treating blanks as unset', () => {
    const c = loadConfig({ ...base, CRANK_MAX_FEE_FIL: '0.5', CRANK_TX_TIMEOUT_MS: '60000' });
    assert.equal(c.maxFeeWei, parseEther('0.5'));
    assert.equal(c.txTimeoutMs, 60_000);
    assert.equal(loadConfig({ ...base, CRANK_MAX_FEE_FIL: '' }).maxFeeWei, parseEther('0.1'));
  });

  it('refuses a zero, negative or non-numeric cap', () => {
    assert.throws(() => loadConfig({ ...base, CRANK_MAX_FEE_FIL: '0' }), /CRANK_MAX_FEE_FIL/);
    assert.throws(() => loadConfig({ ...base, CRANK_MAX_FEE_FIL: '-1' }), /CRANK_MAX_FEE_FIL/);
    assert.throws(() => loadConfig({ ...base, CRANK_MAX_FEE_FIL: 'lots' }), /CRANK_MAX_FEE_FIL/);
  });

  it('marks a Mainnet run with sends off, so a due quarter can be warned about', () => {
    assert.equal(loadConfig({ NETWORK: 'mainnet' }, { requireKey: false }).mainnetBlocked, true);
    assert.equal(loadConfig({ NETWORK: 'mainnet', MAINNET_SEND_ENABLED: 'true' }, { requireKey: false }).mainnetBlocked, false);
    assert.equal(loadConfig(base).mainnetBlocked, false);
  });
});
