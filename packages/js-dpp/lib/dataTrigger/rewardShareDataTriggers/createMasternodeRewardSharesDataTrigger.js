const DataTriggerConditionError = require('../../errors/consensus/state/dataContract/dataTrigger/DataTriggerConditionError');
const DataTriggerExecutionResult = require('../DataTriggerExecutionResult');
const { hash } = require('../../util/hash');

const MAX_PERCENTAGE = 10000;

/**
 * @param {DocumentCreateTransition} documentTransition
 * @param {DataTriggerExecutionContext} context
 * @return {Promise<DataTriggerExecutionResult>}
 */
async function createMasternodeRewardSharesDataTrigger(
  documentTransition,
  context,
) {
  const {
    payToId,
    percentage,
  } = documentTransition.getData();

  const ownerId = context.getOwnerId();

  const result = new DataTriggerExecutionResult();

  // Do not allow creating document if ownerId is not in SML
  const smlStore = await context.getStateRepository().fetchSMLStore();
  const validMasternodesList = smlStore.getCurrentSML().getValidMasternodesList();

  const ownerIdInSml = !!validMasternodesList.find(
    (smlEntry) => Buffer.compare(ownerId, hash(Buffer.from(smlEntry.proRegTxHash, 'hex'))) === 0,
  );

  if (!ownerIdInSml) {
    const error = new DataTriggerConditionError(
      context.getDataContract().getId().toBuffer(),
      documentTransition.getId().toBuffer(),
      'Only masternode identities can share rewards',
    );

    error.setOwnerId(ownerId);
    error.setDocumentTransition(documentTransition);

    result.addError(error);

    return result;
  }

  // payToId identity exists
  const identity = await context.getStateRepository().fetchIdentity(payToId);
  if (identity === null) {
    const error = new DataTriggerConditionError(
      context.getDataContract().getId().toBuffer(),
      documentTransition.getId().toBuffer(),
      `Identity ${payToId.toString()} doesn't exist`,
    );

    error.setOwnerId(ownerId);
    error.setDocumentTransition(documentTransition);

    result.addError(error);

    return result;
  }

  // The overall percentage for ownerId is not more than 10000
  const documents = await context.getStateRepository().fetchDocuments(
    context.getDataContract().getId(),
    documentTransition.getType(),
    {
      where: [
        ['$ownerId', '==', ownerId],
      ],
    },
  );

  const totalPercent = documents
    .reduce((prevValue, document) => prevValue + document.data.percentage, percentage);

  if (totalPercent > MAX_PERCENTAGE) {
    const error = new DataTriggerConditionError(
      context.getDataContract().getId().toBuffer(),
      documentTransition.getId().toBuffer(),
      `Percentage can not be more than ${MAX_PERCENTAGE}`,
    );

    error.setOwnerId(ownerId);
    error.setDocumentTransition(documentTransition);

    result.addError(error);
  }

  return result;
}

module.exports = createMasternodeRewardSharesDataTrigger;
