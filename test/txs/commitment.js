/* global describe,it,beforeEach */
'use strict'
let should = require('should')
let asink = require('asink')
let Output = require('../../lib/output')
let Commitment = require('../../lib/txs/commitment')
let Funding = require('../../lib/txs/funding')
let HtlcSecret = require('../../lib/scrts/htlc-secret')
let RevSecret = require('../../lib/scrts/rev-secret')
let Agent = require('../../lib/agent')
let Wallet = require('../../lib/wallet')
let SecretHelper = require('../test-helpers/secret-helper')
let PrivKey = require('yours-bitcoin/lib/priv-key')
let Bip32 = require('yours-bitcoin/lib/bip-32')
let Bn = require('yours-bitcoin/lib/bn')
let TxVerifier = require('yours-bitcoin/lib/tx-verifier')
let Interp = require('yours-bitcoin/lib/interp')

let bob, carol
let htlcSecret, revSecret
let xPubs, outputs

describe('Commitment', function () {
  it('should exist', function () {
    should.exist(Commitment)
    should.exist(new Commitment())
  })

  beforeEach(function () {
    return asink(function * () {
      bob = new Agent('bob')
      yield bob.asyncInitialize(PrivKey.fromRandom(), PrivKey.fromRandom(), PrivKey.fromRandom())
      bob.funder = true
      carol = new Agent('carol')
      yield carol.asyncInitialize(PrivKey.fromRandom(), PrivKey.fromRandom(), PrivKey.fromRandom())

      bob.other = yield carol.asyncToPublic()
      carol.other = yield bob.asyncToPublic()

      yield bob.multisigAddress.asyncInitialize(bob.other.multisigAddress.pubKey)
      yield carol.multisigAddress.asyncInitialize(carol.other.multisigAddress.pubKey)

      let inputAmountBn = Bn(1e10)
      let fundingAmount = Bn(1e8)
      let wallet = new Wallet()
      let output = wallet.getUnspentOutput(inputAmountBn, bob.sourceAddress.keyPair.pubKey)

      let funding = new Funding()
      yield funding.asyncInitialize(
        fundingAmount,
        bob.sourceAddress,
        bob.multisigAddress,
        output.txhashbuf,
        output.txoutnum,
        output.txout,
        output.pubKey,
        output.inputTxout)

      bob.funding = carol.funding = funding

      htlcSecret = new HtlcSecret()
      yield htlcSecret.asyncInitialize()
      revSecret = new RevSecret()
      yield revSecret.asyncInitialize()

      let bobBip32 = new Bip32().fromRandom()
      let bobBip32Public = bobBip32.toPublic()
      let carolBip32 = new Bip32().fromRandom()
      let carolBip32Public = carolBip32.toPublic()
      xPubs = {
        bob: bobBip32Public,
        carol: carolBip32Public
      }

      outputs = [
        new Output(
          'htlc',
          'alice', 'bob', 'carol', 'dave',
          'm/1/2', 'm/4/5',
          htlcSecret, revSecret,
          Bn(1e7)),
        new Output(
          'pubKey',
          'alice', 'bob', 'carol', 'dave',
          'm/1/2', 'm/4/5',
          htlcSecret, revSecret,
          Bn(1e7))
      ]
    }, this)
  })

  it('build without signing', function () {
    return asink(function * () {
      let commitment = new Commitment()
      commitment.outputs = outputs
      yield commitment.asyncBuild(
        bob.funding.txb.tx.hash(),
        bob.funding.txb.tx.txOuts[0],
        bob.multisigAddress,
        carol.id,
        xPubs)

      let txVerifier, error
      txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
      error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
      // we expect an error here as the transaction is not fully signed
      error.should.equal('input 0 failed script verify')
    }, this)
  })

  describe('#asyncBuild', function () {
    it('case with only a change output', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = [
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7))
        ]
        yield commitment.asyncBuild(
          carol.funding.txb.tx.hash(),
          carol.funding.txb.tx.txOuts[0],
          carol.multisigAddress,
          carol.id,
          xPubs)
        yield commitment.txb.asyncSign(0, bob.multisigAddress.keyPair, bob.funding.txb.tx.txOuts[0])

        let txVerifier, error
        txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        error.should.equal(false)

        should.exist(commitment)
        should.exist(commitment.txb)
        should.exist(commitment.outputs)

        should.exist(commitment.outputs[0])
        should.exist(commitment.outputs[0].redeemScript)
        should.exist(commitment.outputs[0].scriptPubkey)

        SecretHelper.checkSecretNotHidden(commitment.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[0].revSecret)
      }, this)
    })

    it('case with one pubKey output and a change output', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = [
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7)),
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7))
        ]
        yield commitment.asyncBuild(
          carol.funding.txb.tx.hash(),
          carol.funding.txb.tx.txOuts[0],
          carol.multisigAddress,
          carol.id,
          xPubs)
        yield commitment.txb.asyncSign(0, bob.multisigAddress.keyPair, bob.funding.txb.tx.txOuts[0])

        let txVerifier, error
        txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        // we expect an error here as the transaction is not fully signed
        error.should.equal(false)

        should.exist(commitment)
        should.exist(commitment.txb)
        should.exist(commitment.outputs)

        should.exist(commitment.outputs[0])
        should.exist(commitment.outputs[0].redeemScript)
        should.exist(commitment.outputs[0].scriptPubkey)

        should.exist(commitment.outputs[1])
        should.exist(commitment.outputs[1].redeemScript)
        should.exist(commitment.outputs[1].scriptPubkey)

        SecretHelper.checkSecretNotHidden(commitment.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].revSecret)
      }, this)
    })

    it('case with one revocable pubKey output and a change output', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = [
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7)),
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7))
        ]
        yield commitment.asyncBuild(
          bob.funding.txb.tx.hash(),
          carol.funding.txb.tx.txOuts[0],
          bob.multisigAddress,
          bob.id,
          xPubs)
        yield commitment.txb.asyncSign(0, carol.multisigAddress.keyPair, carol.funding.txb.tx.txOuts[0])

        let txVerifier, error
        txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        // we expect an error here as the transaction is not fully signed
        error.should.equal(false)

        should.exist(commitment)
        should.exist(commitment.txb)
        should.exist(commitment.outputs)

        should.exist(commitment.outputs[0])
        should.exist(commitment.outputs[0].redeemScript)
        should.exist(commitment.outputs[0].scriptPubkey)

        should.exist(commitment.outputs[1])
        should.exist(commitment.outputs[1].redeemScript)
        should.exist(commitment.outputs[1].scriptPubkey)

        SecretHelper.checkSecretNotHidden(commitment.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].revSecret)
      }, this)
    })

    it('case with one htlc output and a change output', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = [
          new Output(
            'htlc',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7)),
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7))
        ]
        yield commitment.asyncBuild(
          carol.funding.txb.tx.hash(),
          carol.funding.txb.tx.txOuts[0],
          carol.multisigAddress,
          carol.id,
          xPubs)
        yield commitment.txb.asyncSign(0, bob.multisigAddress.keyPair, bob.funding.txb.tx.txOuts[0])

        let txVerifier, error
        txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        // we expect an error here as the transaction is not fully signed
        error.should.equal(false)

        should.exist(commitment)
        should.exist(commitment.txb)
        should.exist(commitment.outputs)

        should.exist(commitment.outputs[0])
        should.exist(commitment.outputs[0].redeemScript)
        should.exist(commitment.outputs[0].scriptPubkey)

        should.exist(commitment.outputs[1])
        should.exist(commitment.outputs[1].redeemScript)
        should.exist(commitment.outputs[1].scriptPubkey)

        SecretHelper.checkSecretNotHidden(commitment.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].revSecret)
      }, this)
    })

    it('case with one revocable htlc output and a change output', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = [
          new Output(
            'htlc',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7)),
          new Output(
            'pubKey',
            'alice', 'bob', 'carol', 'dave',
            'm/1/2', 'm/4/5',
            htlcSecret, revSecret,
            Bn(1e7))
        ]
        yield commitment.asyncBuild(
          bob.funding.txb.tx.hash(),
          bob.funding.txb.tx.txOuts[0],
          bob.multisigAddress,
          bob.id,
          xPubs)
        yield commitment.txb.asyncSign(0, carol.multisigAddress.keyPair, carol.funding.txb.tx.txOuts[0])

        let txVerifier, error
        txVerifier = new TxVerifier(commitment.txb.tx, commitment.txb.uTxOutMap)
        error = txVerifier.verifyStr(Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY | Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)
        // we expect an error here as the transaction is not fully signed
        error.should.equal(false)

        should.exist(commitment)
        should.exist(commitment.txb)
        should.exist(commitment.outputs)

        should.exist(commitment.outputs[0])
        should.exist(commitment.outputs[0].redeemScript)
        should.exist(commitment.outputs[0].scriptPubkey)

        should.exist(commitment.outputs[1])
        should.exist(commitment.outputs[1].redeemScript)
        should.exist(commitment.outputs[1].scriptPubkey)

        SecretHelper.checkSecretNotHidden(commitment.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(commitment.outputs[1].revSecret)
      }, this)
    })
  })

  describe('#toJSON', function () {
    it('should create a json object', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = outputs
        yield commitment.asyncBuild(
          bob.funding.txb.tx.hash(),
          bob.funding.txb.tx.txOuts[0],
          bob.multisigAddress,
          bob.id,
          xPubs)
        yield commitment.txb.asyncSign(0, carol.multisigAddress.keyPair, carol.funding.txb.tx.txOuts[0])
        let json = commitment.toJSON()

        should.exist(json)
        should.exist(json.txb)
        should.exist(json.outputs)

        SecretHelper.checkSecretNotHidden(json.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(json.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(json.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(json.outputs[1].revSecret)
      }, this)
    })
  })

  describe('#fromJSON', function () {
    it('should create Commitment from a json object', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = outputs
        yield commitment.asyncBuild(
          bob.funding.txb.tx.hash(),
          bob.funding.txb.tx.txOuts[0],
          bob.multisigAddress,
          bob.id,
          xPubs)

        let json = commitment.toJSON()
        let txo = new Commitment().fromJSON(json)

        should.exist(txo)
        should.exist(txo.txb)
        should.exist(txo.outputs)

        SecretHelper.checkSecretNotHidden(txo.outputs[0].htlcSecret)
        SecretHelper.checkSecretNotHidden(txo.outputs[0].revSecret)
        SecretHelper.checkSecretNotHidden(txo.outputs[1].htlcSecret)
        SecretHelper.checkSecretNotHidden(txo.outputs[1].revSecret)
      }, this)
    })
  })

  describe('#toPublic', function () {
    it('should create a public Commitment object', function () {
      return asink(function * () {
        let commitment = new Commitment()
        commitment.outputs = outputs
        yield commitment.asyncBuild(
          bob.funding.txb.tx.hash(),
          bob.funding.txb.tx.txOuts[0],
          bob.multisigAddress,
          bob.id,
          xPubs)
        let txo = commitment.toPublic()

        should.exist(txo)
        should.exist(txo.txb)
        should.exist(txo.outputs)

        SecretHelper.checkSecretHidden(txo.outputs[0].htlcSecret)
        SecretHelper.checkSecretHidden(txo.outputs[0].revSecret)
        SecretHelper.checkSecretHidden(txo.outputs[1].htlcSecret)
        SecretHelper.checkSecretHidden(txo.outputs[1].revSecret)
      }, this)
    })
  })
})
