const getDocumentsFixture = require('@dashevo/dpp/lib/test/fixtures/getDocumentsFixture');
const getIdentityFixture = require('@dashevo/dpp/lib/test/fixtures/getIdentityFixture');
const getDataContractFixture = require('@dashevo/dpp/lib/test/fixtures/getDataContractFixture');
const generateRandomIdentifier = require('@dashevo/dpp/lib/test/utils/generateRandomIdentifier');

const DriveStateRepository = require('../../../lib/dpp/DriveStateRepository');

describe('DriveStateRepository', () => {
  let stateRepository;
  let identityRepositoryMock;
  let publicKeyIdentityIdRepositoryMock;
  let dataContractRepositoryMock;
  let fetchDocumentsMock;
  let documentsRepositoryMock;
  let spentAssetLockTransactionsRepositoryMock;
  let coreRpcClientMock;
  let id;
  let identity;
  let documents;
  let dataContract;
  let blockExecutionContextMock;
  let simplifiedMasternodeListMock;
  let instantLockMock;
  let dataContractCacheMock;
  let repositoryOptions;

  beforeEach(function beforeEach() {
    identity = getIdentityFixture();
    documents = getDocumentsFixture();
    dataContract = getDataContractFixture();
    id = generateRandomIdentifier();

    coreRpcClientMock = {
      getRawTransaction: this.sinon.stub(),
      verifyIsLock: this.sinon.stub(),
    };

    dataContractRepositoryMock = {
      fetch: this.sinon.stub(),
      store: this.sinon.stub(),
    };

    identityRepositoryMock = {
      fetch: this.sinon.stub(),
      store: this.sinon.stub(),
    };

    publicKeyIdentityIdRepositoryMock = {
      fetch: this.sinon.stub(),
      store: this.sinon.stub(),
    };

    fetchDocumentsMock = this.sinon.stub();

    documentsRepositoryMock = {
      store: this.sinon.stub(),
      find: this.sinon.stub(),
      delete: this.sinon.stub(),
    };

    spentAssetLockTransactionsRepositoryMock = {
      store: this.sinon.stub(),
      find: this.sinon.stub(),
      delete: this.sinon.stub(),
    };

    blockExecutionContextMock = {
      getHeader: this.sinon.stub(),
    };

    simplifiedMasternodeListMock = {
      getStore: this.sinon.stub(),
    };

    dataContractCacheMock = {
      set: this.sinon.stub(),
      get: this.sinon.stub(),
    };

    repositoryOptions = { useTransaction: true };

    stateRepository = new DriveStateRepository(
      identityRepositoryMock,
      publicKeyIdentityIdRepositoryMock,
      dataContractRepositoryMock,
      fetchDocumentsMock,
      documentsRepositoryMock,
      spentAssetLockTransactionsRepositoryMock,
      coreRpcClientMock,
      blockExecutionContextMock,
      simplifiedMasternodeListMock,
      dataContractCacheMock,
      repositoryOptions,
    );

    instantLockMock = {
      getRequestId: () => 'someRequestId',
      txid: 'someTxId',
      signature: 'signature',
      verify: this.sinon.stub(),
    };
  });

  describe('#fetchIdentity', () => {
    it('should fetch identity from repository', async () => {
      identityRepositoryMock.fetch.resolves(identity);

      const result = await stateRepository.fetchIdentity(id);

      expect(result).to.equal(identity);
      expect(identityRepositoryMock.fetch).to.be.calledOnceWith(
        id,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#storeIdentity', () => {
    it('should store identity to repository', async () => {
      await stateRepository.storeIdentity(identity);

      expect(identityRepositoryMock.store).to.be.calledOnceWith(
        identity,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#storeIdentityPublicKeyHashes', () => {
    it('should store public key hashes for an identity id to repository', async () => {
      await stateRepository.storeIdentityPublicKeyHashes(
        identity.getId(),
        [
          identity.getPublicKeyById(0).hash(),
          identity.getPublicKeyById(1).hash(),
        ],
      );

      expect(publicKeyIdentityIdRepositoryMock.store).to.have.been.calledTwice();
      expect(publicKeyIdentityIdRepositoryMock.store.getCall(0).args).to.have.deep.members([
        identity.getPublicKeyById(0).hash(),
        identity.getId(),
        repositoryOptions.useTransaction,
      ]);
      expect(publicKeyIdentityIdRepositoryMock.store.getCall(1).args).to.have.deep.members([
        identity.getPublicKeyById(1).hash(),
        identity.getId(),
        repositoryOptions.useTransaction,
      ]);
    });
  });

  describe('#fetchIdentityIdsByPublicKeyHashes', () => {
    it('should fetch map of previously stored public key hash and identity id pairs', async () => {
      const publicKeyHashes = [
        identity.getPublicKeyById(0).hash(),
        identity.getPublicKeyById(1).hash(),
      ];

      publicKeyIdentityIdRepositoryMock
        .fetch
        .withArgs(publicKeyHashes[0])
        .resolves(identity.getId());

      publicKeyIdentityIdRepositoryMock
        .fetch
        .withArgs(publicKeyHashes[1])
        .resolves(identity.getId());

      const result = await stateRepository.fetchIdentityIdsByPublicKeyHashes(
        publicKeyHashes,
      );

      expect(result).to.have.deep.members([
        identity.getId(),
        identity.getId(),
      ]);
    });

    it('should have null as value if pair was not found', async () => {
      const publicKeyHashes = [
        identity.getPublicKeyById(0).hash(),
        identity.getPublicKeyById(1).hash(),
      ];

      publicKeyIdentityIdRepositoryMock
        .fetch
        .withArgs(publicKeyHashes[0])
        .resolves(identity.getId());

      publicKeyIdentityIdRepositoryMock
        .fetch
        .withArgs(publicKeyHashes[1])
        .resolves(null);

      const result = await stateRepository.fetchIdentityIdsByPublicKeyHashes(
        publicKeyHashes,
      );

      expect(result).to.have.deep.members([
        identity.getId(),
        null,
      ]);
    });
  });

  describe('#fetchDataContract', () => {
    it('should fetch data contract from repository', async () => {
      dataContractRepositoryMock.fetch.resolves(dataContract);

      const result = await stateRepository.fetchDataContract(id);

      expect(result).to.equal(dataContract);
      expect(dataContractRepositoryMock.fetch).to.be.calledOnceWith(id);
    });
  });

  describe('#storeDataContract', () => {
    it('should store data contract to repository', async () => {
      await stateRepository.storeDataContract(dataContract);

      expect(dataContractRepositoryMock.store).to.be.calledOnceWith(
        dataContract,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#fetchDocuments', () => {
    it('should fetch documents from repository', async () => {
      const type = 'documentType';
      const options = {};

      fetchDocumentsMock.resolves(documents);

      const result = await stateRepository.fetchDocuments(id, type, options);

      expect(result).to.equal(documents);
      expect(fetchDocumentsMock).to.be.calledOnceWith(
        id,
        type,
        options,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#storeDocument', () => {
    it('should store document in repository', async () => {
      const [document] = documents;
      await stateRepository.storeDocument(document);

      expect(documentsRepositoryMock.store).to.be.calledOnceWith(
        document,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#removeDocument', () => {
    it('should delete document from repository', async () => {
      dataContractCacheMock.get.returns(null);
      dataContractRepositoryMock.fetch.resolves(dataContract);

      const contractId = generateRandomIdentifier();
      const type = 'documentType';

      await stateRepository.removeDocument(contractId, type, id);

      expect(dataContractRepositoryMock.fetch).to.be.calledOnceWithExactly(contractId);
      expect(dataContractCacheMock.set).to.be.calledOnceWithExactly(
        contractId.toString(),
        dataContract,
      );

      expect(documentsRepositoryMock.delete).to.be.calledOnceWith(
        dataContract,
        type,
        id,
        repositoryOptions.useTransaction,
      );
    });
  });

  describe('#fetchTransaction', () => {
    it('should fetch transaction from core', async () => {
      const rawTransaction = {
        hex: 'some result',
        height: 1,
      };

      coreRpcClientMock.getRawTransaction.resolves({ result: rawTransaction });

      const result = await stateRepository.fetchTransaction(id);

      expect(result).to.deep.equal({
        data: Buffer.from(rawTransaction.hex, 'hex'),
        height: rawTransaction.height,
      });
      expect(coreRpcClientMock.getRawTransaction).to.be.calledOnceWithExactly(id, 1);
    });

    it('should return null if core throws Invalid address or key error', async () => {
      const error = new Error('Some error');
      error.code = -5;

      coreRpcClientMock.getRawTransaction.throws(error);

      const result = await stateRepository.fetchTransaction(id);

      expect(result).to.equal(null);
      expect(coreRpcClientMock.getRawTransaction).to.be.calledOnceWith(id);
    });

    it('should throw an error if core throws an unknown error', async () => {
      const error = new Error('Some error');

      coreRpcClientMock.getRawTransaction.throws(error);

      try {
        await stateRepository.fetchTransaction(id);

        expect.fail('should throw error');
      } catch (e) {
        expect(e).to.equal(error);
        expect(coreRpcClientMock.getRawTransaction).to.be.calledOnceWith(id);
      }
    });
  });

  describe('#fetchLatestPlatformBlockHeader', () => {
    it('should fetch latest platform block header', async () => {
      const header = {
        height: 10,
        time: {
          seconds: Math.ceil(new Date().getTime() / 1000),
        },
      };

      blockExecutionContextMock.getHeader.resolves(header);

      const result = await stateRepository.fetchLatestPlatformBlockHeader();

      expect(result).to.deep.equal(header);
      expect(blockExecutionContextMock.getHeader).to.be.calledOnce();
    });
  });

  describe('#verifyInstantLock', () => {
    let smlStore;

    beforeEach(() => {
      blockExecutionContextMock.getHeader.returns({
        header: 41,
        coreChainLockedHeight: 42,
      });

      smlStore = {};

      simplifiedMasternodeListMock.getStore.returns(smlStore);
    });

    it('it should verify instant lock using Core', async () => {
      coreRpcClientMock.verifyIsLock.resolves({ result: true });

      const result = await stateRepository.verifyInstantLock(instantLockMock);

      expect(result).to.equal(true);
      expect(coreRpcClientMock.verifyIsLock).to.have.been.calledOnceWithExactly(
        'someRequestId',
        'someTxId',
        'signature',
        42,
      );
      expect(instantLockMock.verify).to.have.not.been.called();
    });

    it('should return false if core throws Invalid address or key error', async () => {
      const error = new Error('Some error');
      error.code = -5;

      coreRpcClientMock.verifyIsLock.throws(error);

      const result = await stateRepository.verifyInstantLock(instantLockMock);

      expect(result).to.equal(false);
      expect(coreRpcClientMock.verifyIsLock).to.have.been.calledOnceWithExactly(
        'someRequestId',
        'someTxId',
        'signature',
        42,
      );
      expect(instantLockMock.verify).to.have.not.been.called();
    });

    it('should return false if core throws Invalid parameter', async () => {
      const error = new Error('Some error');
      error.code = -8;

      coreRpcClientMock.verifyIsLock.throws(error);

      const result = await stateRepository.verifyInstantLock(instantLockMock);

      expect(result).to.equal(false);
      expect(coreRpcClientMock.verifyIsLock).to.have.been.calledOnceWithExactly(
        'someRequestId',
        'someTxId',
        'signature',
        42,
      );
      expect(instantLockMock.verify).to.have.not.been.called();
    });

    it('should return false if header is null', async () => {
      blockExecutionContextMock.getHeader.returns(null);

      const result = await stateRepository.verifyInstantLock(instantLockMock);

      expect(result).to.be.false();
    });
  });

  describe('#fetchSMLStore', () => {
    it('should fetch SML store', async () => {
      simplifiedMasternodeListMock.getStore.resolves('store');

      const result = await stateRepository.fetchSMLStore();

      expect(result).to.equal('store');
      expect(simplifiedMasternodeListMock.getStore).to.be.calledOnce();
    });
  });
});
