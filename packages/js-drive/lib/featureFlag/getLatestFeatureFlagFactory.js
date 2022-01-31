/**
 * @param {Identifier} featureFlagsContractId
 * @param {fetchDocuments} fetchDocuments
 *
 * @return {getLatestFeatureFlag}
 */
function getLatestFeatureFlagFactory(
  featureFlagsContractId,
  fetchDocuments,
) {
  /**
   * @typedef getLatestFeatureFlag
   *
   * @param {string} flagType
   * @param {Long} blockHeight
   * @param {DocumentsIndexedTransaction} [transaction]
   *
   * @return {Promise<Document|null>}
   */
  async function getLatestFeatureFlag(flagType, blockHeight, transaction = undefined) {
    if (!featureFlagsContractId) {
      return null;
    }

    const query = {
      where: [
        ['enableAtHeight', '<=', blockHeight.toNumber()],
      ],
      orderBy: [
        ['enableAtHeight', 'desc'],
      ],
      limit: 1,
    };

    const [document] = await fetchDocuments(
      featureFlagsContractId,
      flagType,
      query,
      transaction,
    );

    return document;
  }

  return getLatestFeatureFlag;
}

module.exports = getLatestFeatureFlagFactory;
