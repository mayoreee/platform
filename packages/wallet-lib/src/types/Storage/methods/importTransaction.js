const { Transaction } = require('@dashevo/dashcore-lib');
const { Output } = Transaction;
const { InvalidDashcoreTransaction } = require('../../../errors');
const { FETCHED_CONFIRMED_TRANSACTION, TX_METADATA } = require('../../../EVENTS');

const parseStringifiedTransaction = (stringified) => new Transaction(stringified);
/**
 * This method is used to import a transaction in Store.
 * if a transaction is already existing, we verify if the metadata needs an update as well.
 * @param {Transaction/String} transaction - A valid Transaction
 * @param {TransactionMetaData} transactionMetadata - Transaction Metadata
 * @return void
 */
const importTransaction = function importTransaction(transaction, transactionMetadata) {
  if (!(transaction instanceof Transaction)) {
    try {
      // eslint-disable-next-line no-param-reassign
      transaction = parseStringifiedTransaction(transaction);
      if (!transaction.hash || !transaction.inputs.length || !transaction.outputs.length) {
        throw new InvalidDashcoreTransaction(transaction);
      }
    } catch (e) {
      throw new InvalidDashcoreTransaction(transaction);
    }
  }
  const {
    store,
    network,
    mappedAddress,
    mappedTransactionsHeight,
  } = this;
  const { transactions, transactionsMetadata } = store;
  const { inputs, outputs } = transaction;

  let hasUpdateStorage = false;
  let outputIndex = -1;
  const processedAddressesForTx = {};

  transactions[transaction.hash] = transaction;
  if (transactionMetadata) {
    const { height } = transactionMetadata;
    if (Number.isInteger(height) && height !== 0) {
      transactionsMetadata[transaction.hash] = transactionMetadata;
      const mappedTransactionObject = { hash: transaction.hash, ...transactionMetadata };

      if (mappedTransactionsHeight[height]) {
        // If we had this transaction locally, and it might have not been final (confirmed)
        // We require to look if it previously existed and need replace or to add it
        const findIndex = mappedTransactionsHeight[height]
          .findIndex((el) => el.hash === transaction.hash);

        if (findIndex >= 0) {
          mappedTransactionsHeight[height][findIndex] = mappedTransactionObject;
        } else {
          mappedTransactionsHeight[height].push(mappedTransactionObject);
        }
      } else {
        mappedTransactionsHeight[height] = ([mappedTransactionObject]);
      }

      this.announce(TX_METADATA, { hash: transaction.hash, metadata: transactionMetadata });
    }
  }

  // even if we had this transaction locally, we need to
  // process it to ensure no new address (BIP44) needs to be generated
  [...inputs, ...outputs].forEach((element) => {
    const isOutput = (element instanceof Output);
    if (isOutput) outputIndex += 1;

    if (element.script) {
      const address = element.script.toAddress(network).toString();

      if (mappedAddress && mappedAddress[address]) {
        const { path, type, walletId } = mappedAddress[address];
        const addressObject = store.wallets[walletId].addresses[type][path];
        // If the transactions has already been processed in a previous insertion,
        // we can skip the processing now
        if (addressObject.transactions.includes(transaction.hash)) {
          return;
        }

        if (!addressObject.used) addressObject.used = true;

        // We mark our address as affected so we update the tx later on
        if (!processedAddressesForTx[addressObject.address]) {
          processedAddressesForTx[addressObject.address] = addressObject;
        }

        if (!isOutput) {
          const vin = element;
          const utxoKey = `${vin.prevTxId.toString('hex')}-${vin.outputIndex}`;
          if (addressObject.utxos[utxoKey]) {
            const previousOutput = addressObject.utxos[utxoKey];
            addressObject.balanceSat -= previousOutput.satoshis;
            delete addressObject.utxos[utxoKey];
            hasUpdateStorage = true;
          }
        } else {
          const vout = element;

          const utxoKey = `${transaction.hash}-${outputIndex}`;
          if (!addressObject.utxos[utxoKey]) {
            addressObject.utxos[utxoKey] = vout;
            addressObject.balanceSat += vout.satoshis;
            hasUpdateStorage = true;
          } else if (addressObject.unconfirmedBalanceSat >= vout.satoshis) {
            addressObject.unconfirmedBalanceSat -= vout.satoshis;
            addressObject.balanceSat += vout.satoshis;
            hasUpdateStorage = true;
          }
        }
      }
    }
  });

  // As the same address can have one or more inputs and one or more outputs in the same tx
  // we update it's transactions array as last step of importing
  Object.values(processedAddressesForTx).forEach((addressObject) => {
    addressObject.transactions.push(transaction.hash);
  });

  if (hasUpdateStorage) {
    this.lastModified = +new Date();
    // Announce only confirmed transaction imported that are our.
    this.announce(FETCHED_CONFIRMED_TRANSACTION, { transaction });
  }
};
module.exports = importTransaction;
