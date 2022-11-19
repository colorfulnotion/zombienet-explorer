-- MySQL dump 10.13  Distrib 8.0.30, for Linux (x86_64)
--
-- Host: db00.polkaholic.internal    Database: defi
-- ------------------------------------------------------
-- Server version	5.7.39-google-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `account`
--

DROP TABLE IF EXISTS `account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numFollowers` int(11) DEFAULT '0',
  `numFollowing` int(11) DEFAULT '0',
  `verified` tinyint(4) DEFAULT '0',
  `verifyDT` datetime DEFAULT NULL,
  `judgements` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `info` blob,
  `judgementsKSM` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `infoKSM` blob,
  PRIMARY KEY (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `address`
--

DROP TABLE IF EXISTS `address`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `address` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `balanceUSD` double DEFAULT NULL,
  `balanceUSDupdateDT` datetime DEFAULT NULL,
  `symbols` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exchanges` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numChains` int(11) DEFAULT NULL,
  `numAssets` int(11) DEFAULT NULL,
  `tags` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numTransfersIn` int(11) DEFAULT NULL,
  `transferInFirstTS` int(11) DEFAULT '0',
  `transferInLastTS` int(11) DEFAULT '0',
  `avgTransferInUSD` double DEFAULT NULL,
  `sumTransferInUSD` double DEFAULT NULL,
  `numTransfersOut` int(11) DEFAULT NULL,
  `transferOutFirstTS` int(11) DEFAULT '0',
  `transferOutLastTS` int(11) DEFAULT '0',
  `avgTransferOutUSD` double DEFAULT NULL,
  `sumTransferOutUSD` double DEFAULT NULL,
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsicsDefi` int(11) DEFAULT '0',
  `extrinsicFirstTS` int(11) DEFAULT NULL,
  `extrinsicLastTS` int(11) DEFAULT NULL,
  `numCrowdloans` int(11) DEFAULT '0',
  `crowdloansUSD` double DEFAULT NULL,
  `numSubAccounts` int(11) DEFAULT '0',
  `numRewards` int(11) DEFAULT '0',
  `rewardsUSD` double DEFAULT NULL,
  PRIMARY KEY (`address`),
  KEY `balanceUSD` (`balanceUSD`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `address0`
--

DROP TABLE IF EXISTS `address0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `address0` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ss58Address` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `free` decimal(65,18) DEFAULT NULL,
  `reserved` decimal(65,18) DEFAULT NULL,
  `miscFrozen` decimal(65,18) DEFAULT NULL,
  `frozen` decimal(65,18) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `requested` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`address`),
  KEY `holder` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `addressTopN`
--

DROP TABLE IF EXISTS `addressTopN`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addressTopN` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `topN` enum('balanceUSD','numChains','numAssets','numTransfersIn','avgTransferInUSD','sumTransferInUSD','numTransfersOut','avgTransferOutUSD','sumTransferOutUSD','numExtrinsics','numExtrinsicsDefi','numCrowdloans','numSubAccounts','numRewards','rewardsUSD') COLLATE utf8mb4_unicode_ci NOT NULL,
  `N` int(11) NOT NULL DEFAULT '0',
  `balanceUSD` double DEFAULT '0',
  `val` double DEFAULT '0',
  PRIMARY KEY (`topN`,`N`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `addressoffer`
--

DROP TABLE IF EXISTS `addressoffer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addressoffer` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `offerID` int(11) NOT NULL,
  `startDT` datetime DEFAULT NULL,
  `rewardAmount` double DEFAULT '0',
  `rewardSymbol` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rewardClaimed` tinyint(4) DEFAULT '0',
  `chainID` int(11) DEFAULT NULL,
  `blockNumber` int(11) DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimDT` datetime DEFAULT NULL,
  PRIMARY KEY (`address`,`offerID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `addresssuggestion`
--

DROP TABLE IF EXISTS `addresssuggestion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addresssuggestion` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitter` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addressType` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitDT` datetime DEFAULT NULL,
  `status` enum('Submitted','Accepted','Rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'Submitted',
  `judgementDT` datetime DEFAULT NULL,
  `judge` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`address`,`submitter`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `apikey`
--

DROP TABLE IF EXISTS `apikey`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `apikey` (
  `apikey` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  `deleted` tinyint(4) DEFAULT '0',
  `deleteDT` datetime DEFAULT NULL,
  `planID` int(11) DEFAULT '0',
  PRIMARY KEY (`apikey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `asset`
--

DROP TABLE IF EXISTS `asset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset` (
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainName` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainID` int(11) NOT NULL DEFAULT '0',
  `token0xcmchainID` int(11) DEFAULT NULL,
  `token1xcmchainID` int(11) DEFAULT NULL,
  `abiRaw` mediumblob,
  `numTransactions` int(11) DEFAULT '0',
  `assetType` enum('Unknown','Contract','ERC20','ERC721','ERC1155','Token','LiquidityPair','NFT','Loan','ERC20LP','System','CDP','CDP_Supply','CDP_Borrow') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetName` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decimals` int(11) DEFAULT NULL,
  `totalSupply` decimal(65,18) DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastUpdateDT` datetime DEFAULT NULL,
  `currencyID` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `routeDisabled` tinyint(4) DEFAULT '0',
  `xcContractAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isLocalAsset` tinyint(4) DEFAULT NULL,
  `location` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creator` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAtTx` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  `numHolders` int(11) DEFAULT '0',
  `metadata` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastState` blob,
  `assetPair` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0Symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0Decimals` int(11) DEFAULT NULL,
  `token1` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token1Symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token1Decimals` int(11) DEFAULT NULL,
  `token0Supply` decimal(36,18) DEFAULT NULL,
  `token1Supply` decimal(36,18) DEFAULT NULL,
  `isRouter` tinyint(4) DEFAULT '0',
  `erc721isMetadata` tinyint(4) DEFAULT '0',
  `erc721isEnumerable` tinyint(4) DEFAULT '0',
  `tokenBaseURI` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ipfsUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imageUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priceUSD` double DEFAULT '0',
  `priceUSDPercentChange` double DEFAULT '0',
  `liquid` float DEFAULT '10',
  `lastPriceUpdateDT` datetime DEFAULT NULL,
  `isUSD` tinyint(4) DEFAULT '0',
  `isSkip` tinyint(4) DEFAULT '0',
  `priceUSDpaths` blob,
  `verificationPath` blob,
  `routerUSDpaths` blob,
  `isWrapped` tinyint(4) DEFAULT '0',
  `isNativeChain` tinyint(4) DEFAULT '0',
  `nativeAssetChain` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alternativeAsset` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKey` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `totalFree` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalReserved` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalMiscFrozen` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalFrozen` decimal(65,18) DEFAULT '0.000000000000000000',
  `coingeckoID` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coingeckoLastUpdateDT` datetime DEFAULT NULL,
  `sourceCodeAvailable` tinyint(4) DEFAULT '0',
  `path` varchar(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `apy1d` float DEFAULT '0',
  `apy7d` float DEFAULT '0',
  `apy30d` float DEFAULT '0',
  `feesUSD1d` double DEFAULT '0',
  `feesUSD7d` double DEFAULT '0',
  `feesUSD30d` double DEFAULT '0',
  `tvlUSD` double DEFAULT '0',
  PRIMARY KEY (`asset`,`chainID`),
  KEY `assetType` (`assetType`),
  KEY `xcmInteriorKey` (`xcmInteriorKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assetInit`
--

DROP TABLE IF EXISTS `assetInit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetInit` (
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainName` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainID` int(11) NOT NULL DEFAULT '0',
  `abiRaw` mediumblob,
  `numTransactions` int(11) DEFAULT '0',
  `assetType` enum('Unknown','Contract','ERC20','ERC721','ERC1155','Token','LiquidityPair','NFT','Loan','ERC20LP','Special') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetName` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decimals` int(11) DEFAULT NULL,
  `totalSupply` decimal(65,18) DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastUpdateDT` datetime DEFAULT NULL,
  `currencyID` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creator` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAtTx` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  `numHolders` int(11) DEFAULT '0',
  `metadata` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastState` blob,
  `assetPair` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0Symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token0Decimals` int(11) DEFAULT NULL,
  `token1` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token1Symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token1Decimals` int(11) DEFAULT NULL,
  `token0Supply` decimal(36,18) DEFAULT NULL,
  `token1Supply` decimal(36,18) DEFAULT NULL,
  `erc721isMetadata` tinyint(4) DEFAULT '0',
  `erc721isEnumerable` tinyint(4) DEFAULT '0',
  `tokenBaseURI` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ipfsUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imageUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priceUSD` double DEFAULT '0',
  `priceUSDPercentChange` double DEFAULT '0',
  `lastPriceUpdateDT` datetime DEFAULT NULL,
  `isUSD` tinyint(4) DEFAULT '0',
  `priceUSDpaths` blob,
  `isWrapped` tinyint(4) DEFAULT '0',
  `isNativeChain` tinyint(4) DEFAULT '0',
  `nativeAssetChain` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `totalFree` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalReserved` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalMiscFrozen` decimal(65,18) DEFAULT '0.000000000000000000',
  `totalFrozen` decimal(65,18) DEFAULT '0.000000000000000000',
  PRIMARY KEY (`asset`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assetRouter`
--

DROP TABLE IF EXISTS `assetRouter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetRouter` (
  `assetName` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `router` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numLPs` int(11) DEFAULT '0',
  `addDT` datetime DEFAULT NULL,
  PRIMARY KEY (`assetName`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assetaddress0`
--

DROP TABLE IF EXISTS `assetaddress0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetaddress0` (
  `currencyID` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ss58Address` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `free` decimal(65,18) DEFAULT NULL,
  `reserved` decimal(65,18) DEFAULT NULL,
  `miscFrozen` decimal(65,18) DEFAULT NULL,
  `frozen` decimal(65,18) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastState` blob,
  PRIMARY KEY (`currencyID`,`address`),
  KEY `address` (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `assetfailures`
--

DROP TABLE IF EXISTS `assetfailures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetfailures` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `numFailures` int(11) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assetholder0`
--

DROP TABLE IF EXISTS `assetholder0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetholder0` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL DEFAULT '0',
  `holder` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `free` decimal(65,18) DEFAULT NULL,
  `reserved` decimal(65,18) DEFAULT NULL,
  `miscFrozen` decimal(65,18) DEFAULT NULL,
  `frozen` decimal(65,18) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastState` blob,
  PRIMARY KEY (`asset`,`chainID`,`holder`),
  KEY `holder` (`holder`),
  KEY `free` (`free`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;



--
-- Table structure for table `assetlog`
--

DROP TABLE IF EXISTS `assetlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetlog` (
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainName` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainID` int(11) NOT NULL DEFAULT '1',
  `source` enum('coingecko','oracle','onchain') COLLATE utf8mb4_unicode_ci NOT NULL,
  `indexTS` int(11) NOT NULL,
  `priceUSD` float DEFAULT NULL,
  `total_volumes` decimal(36,18) DEFAULT NULL,
  `market_caps` float DEFAULT NULL,
  `low` double DEFAULT NULL,
  `high` double DEFAULT NULL,
  `open` double DEFAULT NULL,
  `close` double DEFAULT NULL,
  `assetPair` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lp0` double DEFAULT NULL,
  `lp1` double DEFAULT NULL,
  `token0Volume` decimal(36,18) DEFAULT NULL,
  `token1Volume` decimal(36,18) DEFAULT NULL,
  `issuance` decimal(65,18) DEFAULT NULL,
  `debitExchangeRate` decimal(36,18) DEFAULT NULL,
  `supplyExchangeRate` decimal(36,18) DEFAULT NULL,
  `borrowExchangeRate` decimal(36,18) DEFAULT NULL,
  `state` blob,
  PRIMARY KEY (`asset`,`chainID`,`indexTS`,`source`),
  KEY `indexTS2` (`asset`,`chainID`,`indexTS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `assetpricelog`
--

DROP TABLE IF EXISTS `assetpricelog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assetpricelog` (
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL DEFAULT '1',
  `routerAssetChain` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `indexTS` int(11) NOT NULL,
  `priceUSD` float DEFAULT NULL,
  `verificationPath` blob,
  `priceUSD10` double DEFAULT NULL,
  `priceUSD100` double DEFAULT NULL,
  `priceUSD1000` double DEFAULT NULL,
  `liquid` float DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`,`indexTS`,`routerAssetChain`),
  KEY `indexTS2` (`asset`,`chainID`,`indexTS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditHashes`
--

DROP TABLE IF EXISTS `auditHashes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditHashes` (
  `hash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `audit` blob,
  PRIMARY KEY (`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


                                                                                                                                                                                       
create table hashes (
hash varchar(67),
finalized tinyint default 0,
ts int default 0,
data mediumblob default null,
primary key (hash)                                                                                                                                                                                    );

--
-- Table structure for table `block0`
--

DROP TABLE IF EXISTS `block0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `block0` (
  `blockNumber` int(11) NOT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storageRoot` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `archived` tinyint(4) DEFAULT '0',
  `blockDT` datetime DEFAULT NULL,
  `blockraw` mediumblob,
  `feed` mediumblob,
  `events` mediumblob,
  `trace` mediumblob,
  `evmBlock` mediumblob,
  `evmReceipts` mediumblob,
  `lastTraceDT` datetime DEFAULT NULL,
  `lastFeedDT` datetime DEFAULT NULL,
  `numExtrinsics` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numTransfers` int(11) DEFAULT '0',
  `numSignedExtrinsics` int(11) DEFAULT '0',
  `numTraceRecords` int(11) DEFAULT '0',
  `numXCMTransfersIn` int(11) DEFAULT '0',
  `numXCMMessagesIn` int(11) DEFAULT '0',
  `numXCMTransfersOut` int(11) DEFAULT '0',
  `numXCMMessagesOut` int(11) DEFAULT '0',
  `blockHashEVM` varchar(67) DEFAULT '',
  `parentHashEVM` varchar(67) DEFAULT '',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numTransactionsInternalEVM` int(11) DEFAULT '0',
  `numReceiptsEVM` int(11) DEFAULT '0',
  `gasUsed` int(11) DEFAULT '1',
  `gasLimit` int(11) DEFAULT '1',
  `fees` decimal(36,18) DEFAULT NULL,
  PRIMARY KEY (`blockNumber`),
  KEY `blockDT` (`blockDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `blocklog`
--

DROP TABLE IF EXISTS `blocklog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `blocklog` (
  `chainID` int(11) NOT NULL,
  `logDT` date NOT NULL,
  `startBN` int(11) DEFAULT '0',
  `endBN` int(11) DEFAULT '0',
  `numTraces` int(11) DEFAULT '0',
  `numExtrinsics` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numTransfers` int(11) DEFAULT '0',
  `numSignedExtrinsics` int(11) DEFAULT '0',
  `valueTransfersUSD` double DEFAULT '0',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numReceiptsEVM` int(11) DEFAULT '0',
  `gasUsed` bigint(20) DEFAULT NULL,
  `gasLimit` bigint(20) DEFAULT NULL,
  `numEVMBlocks` int(11) DEFAULT '0',
  `numAccountsActive` int(11) DEFAULT NULL,
  `numAccountsActiveLastUpdateDT` datetime DEFAULT NULL,
  `numAddresses` int(11) DEFAULT NULL,
  `numAddressesLastUpdateDT` datetime DEFAULT NULL,
  `fees` decimal(36,18) DEFAULT NULL,
  `numXCMTransfersIn` int(11) DEFAULT '0',
  `numXCMMessagesIn` int(11) DEFAULT '0',
  `numXCMTransfersOut` int(11) DEFAULT '0',
  `numXCMMessagesOut` int(11) DEFAULT '0',
  `valXCMTransferIncomingUSD` double DEFAULT '0',
  `valXCMTransferOutgoingUSD` double DEFAULT '0',
  PRIMARY KEY (`chainID`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `blockunfinalized`
--

DROP TABLE IF EXISTS `blockunfinalized`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `blockunfinalized` (
  `chainID` int(11) NOT NULL,
  `blockNumber` int(11) NOT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parentHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockDT` datetime DEFAULT NULL,
  `lastTraceDT` datetime DEFAULT NULL,
  `blockraw` mediumblob,
  `feed` mediumblob,
  `events` mediumblob,
  `trace` mediumblob,
  `evmBlockHash` varchar(67),
  `evmBlock` mediumblob,
  `evmReceipts` mediumblob,
  `numExtrinsics` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numTransfers` int(11) DEFAULT '0',
  `numSignedExtrinsics` int(11) DEFAULT '0',
  `numTraceRecords` int(11) DEFAULT '0',
  `numXCMTransfersIn` int(11) DEFAULT '0',
  `numXCMMessagesIn` int(11) DEFAULT '0',
  `numXCMTransfersOut` int(11) DEFAULT '0',
  `numXCMMessagesOut` int(11) DEFAULT '0',
  `blockHashEVM` varchar(67) DEFAULT '',
  `parentHashEVM` varchar(67) DEFAULT '',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numTransactionsInternalEVM` int(11) DEFAULT '0',
  `numReceiptsEVM` int(11) DEFAULT '0',
  `gasUsed` int(11) DEFAULT '1',
  `gasLimit` int(11) DEFAULT '1',
  `fees` decimal(36,18) DEFAULT NULL,
  PRIMARY KEY (`chainID`,`blockNumber`,`blockHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bqlog`
--

DROP TABLE IF EXISTS `bqlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bqlog` (
  `logDT` date NOT NULL,
  `indexTS` int(11) DEFAULT NULL,
  `loadDT` datetime DEFAULT NULL,
  `loaded` tinyint(4) DEFAULT '0',
  `readyForIndexing` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`logDT`),
  UNIQUE KEY `logDT` (`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chain`
--

DROP TABLE IF EXISTS `chain`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chain` (
  `chainID` int(11) NOT NULL,
  `id` varchar(128) DEFAULT NULL,
  `prefix` int(11) DEFAULT NULL,
  `chainName` varchar(32) DEFAULT NULL,
  `relayChain` varchar(32) DEFAULT NULL,
  `WSEndpoint` varchar(255) DEFAULT NULL,
  `WSEndpoint2` varchar(255) DEFAULT NULL,
  `WSEndpoint3` varchar(255) DEFAULT NULL,
  `snapshot` varchar(255) DEFAULT NULL,
  `snapshotNumCPU` int(11) DEFAULT '2',
  `snapshotMemGb` int(11) DEFAULT '4',
  `snapshotDiskSizeGb` int(11) DEFAULT '0',
  `snapshotDT` datetime DEFAULT NULL,
  `lastCreateInstanceDT` datetime DEFAULT NULL,
  `features` varchar(255) DEFAULT NULL,
  `WSBackfill` varchar(255) DEFAULT NULL,
  `RPCBackfill` varchar(255) DEFAULT NULL,
  `evmRPC` varchar(255) DEFAULT NULL,
  `evmRPCInternal` varchar(255) DEFAULT NULL,
  `isEVM` tinyint(4) DEFAULT '0',
  `blocksCovered` int(11) DEFAULT '1',
  `blocksFinalized` int(11) DEFAULT '1',
  `lastCleanChainTS` int(11) DEFAULT NULL,
  `blocksCleaned` int(11) DEFAULT '0',
  `displayName` varchar(64) DEFAULT NULL,
  `standardAccount` varchar(32) DEFAULT NULL,
  `decimals` varchar(32) DEFAULT '[]',
  `symbols` varchar(32) DEFAULT '[]',
  `website` varchar(128) DEFAULT NULL,
  `coingeckoID` varchar(40) DEFAULT NULL,
  `coingeckoLastUpdateDT` datetime DEFAULT NULL,
  `symbol` varchar(16) DEFAULT NULL,
  `asset` varchar(32) DEFAULT NULL,
  `firstSeenBlockTS` int(11) DEFAULT '0',
  `ss58Format` int(11) DEFAULT '42',
  `evmChainID` int(11) DEFAULT NULL,
  `crawling` tinyint(4) DEFAULT '0',
  `crawlingStatus` varchar(255) DEFAULT '',
  `lastCrawlDT` datetime DEFAULT NULL,
  `lastFinalizedDT` datetime DEFAULT NULL,
  `lastUpdateChainAssetsTS` int(11) DEFAULT '0',
  `traceTSLast` int(11) DEFAULT '0',
  `backfillLookback` int(11) DEFAULT '1',
  `reindexer` varchar(255) DEFAULT NULL,
  `reindexerCount` tinyint(4) DEFAULT '0',
  `lastUpdateStorageKeysTS` int(11) DEFAULT NULL,
  `iconUrl` varchar(255) DEFAULT NULL,
  `dappURL` varchar(128) DEFAULT NULL,
  `githubURL` varchar(128) DEFAULT NULL,
  `parachainsURL` varchar(128) DEFAULT NULL,
  `subscanURL` varchar(128) DEFAULT NULL,
  `substrateURL` varchar(128) DEFAULT NULL,
  `active` tinyint(4) DEFAULT '0',
  `paraID` int(11) DEFAULT '0',
  `numTraces` int(11) DEFAULT '0',
  `numTraces7d` int(11) DEFAULT '0',
  `numTraces30d` int(11) DEFAULT '0',
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsics7d` int(11) DEFAULT '0',
  `numExtrinsics30d` int(11) DEFAULT '0',
  `numSignedExtrinsics` int(11) DEFAULT '0',
  `numSignedExtrinsics7d` int(11) DEFAULT '0',
  `numSignedExtrinsics30d` int(11) DEFAULT '0',
  `numTransfers` int(11) DEFAULT '0',
  `numTransfers7d` int(11) DEFAULT '0',
  `numTransfers30d` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numEvents7d` int(11) DEFAULT '0',
  `numEvents30d` int(11) DEFAULT '0',
  `valueTransfersUSD` double DEFAULT NULL,
  `valueTransfersUSD7d` double DEFAULT NULL,
  `valueTransfersUSD30d` double DEFAULT NULL,
  `numHolders` int(11) DEFAULT '0',
  `lastBalanceUpdateDT` datetime DEFAULT NULL,
  `assetaddressPallet` varchar(16) DEFAULT NULL,
  `assetNonNativeRegistered` int(11) DEFAULT '0',
  `assetNonNativeUnregistered` int(11) DEFAULT '0',
  `lastUpdateAddressNativeBalanceDT` datetime DEFAULT NULL,
  `totalIssuance` bigint(20) DEFAULT '0',
  `numCrawlBlock` int(11) DEFAULT '0',
  `numCrawlTrace` int(11) DEFAULT '0',
  `numCrawlFeed` int(11) DEFAULT '0',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numTransactionsEVM7d` int(11) DEFAULT '0',
  `numTransactionsEVM30d` int(11) DEFAULT '0',
  `numReceiptsEVM` int(11) DEFAULT '0',
  `numReceiptsEVM7d` int(11) DEFAULT '0',
  `numReceiptsEVM30d` int(11) DEFAULT '0',
  `gasUsed` bigint(20) DEFAULT '0',
  `gasUsed7d` bigint(20) DEFAULT '0',
  `gasUsed30d` bigint(20) DEFAULT '0',
  `gasLimit` bigint(20) DEFAULT '0',
  `gasLimit7d` bigint(20) DEFAULT '0',
  `gasLimit30d` bigint(20) DEFAULT '0',
  `numEVMBlocks` int(11) DEFAULT '0',
  `numEVMBlocks7d` int(11) DEFAULT '0',
  `numEVMBlocks30d` int(11) DEFAULT '0',
  `WSEndpointSelfHosted` tinyint(4) DEFAULT '0',
  `WSEndpointSelfHostedResetDT` datetime DEFAULT NULL,
  `isRelay` int(2) DEFAULT NULL,
  `renewal` int(11) DEFAULT NULL,
  `numXCMTransferIncoming` int(11) DEFAULT '0',
  `numXCMTransferIncoming7d` int(11) DEFAULT '0',
  `numXCMTransferIncoming30d` int(11) DEFAULT '0',
  `numXCMTransferOutgoing` int(11) DEFAULT '0',
  `numXCMTransferOutgoing7d` int(11) DEFAULT '0',
  `numXCMTransferOutgoing30d` int(11) DEFAULT '0',
  `valXCMTransferIncomingUSD` double DEFAULT NULL,
  `valXCMTransferIncomingUSD7d` double DEFAULT NULL,
  `valXCMTransferIncomingUSD30d` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD7d` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD30d` double DEFAULT NULL,
  `isWASM` tinyint(4) DEFAULT '0',
  `numAccountsActive` int(11) DEFAULT '0',
  `numAccountsActive7d` int(11) DEFAULT '0',
  `numAccountsActive30d` int(11) DEFAULT '0',
  `hasSystemContracts` tinyint(4) DEFAULT '0',
  `hasProjects` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`chainID`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chainEndpoint`
--

DROP TABLE IF EXISTS `chainEndpoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chainEndpoint` (
  `chainName` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relayChain` enum('polkadot','kusama','testnet') COLLATE utf8mb4_unicode_ci NOT NULL,
  `homepage` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paraID` int(11) DEFAULT '0',
  `RPCEndpoint` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint2` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint3` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isUnreachable` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`chainName`,`relayChain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chainPalletStorage`
--

DROP TABLE IF EXISTS `chainPalletStorage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chainPalletStorage` (
  `palletName` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storageName` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) DEFAULT NULL,
  `modifier` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` blob,
  `fallback` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `docs` blob,
  `storageKey` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `skip` tinyint(4) DEFAULT '0',
  `lastUpdateDT` date DEFAULT NULL,
  PRIMARY KEY (`palletName`,`storageName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chain_shadow`
--

DROP TABLE IF EXISTS `chain_shadow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chain_shadow` (
  `chainID` int(11) NOT NULL,
  `id` varchar(128) DEFAULT NULL,
  `prefix` int(11) DEFAULT NULL,
  `chainName` varchar(32) DEFAULT NULL,
  `relayChain` varchar(32) DEFAULT NULL,
  `WSEndpoint` varchar(255) DEFAULT NULL,
  `WSEndpoint2` varchar(255) DEFAULT NULL,
  `WSEndpoint3` varchar(255) DEFAULT NULL,
  `snapshot` varchar(255) DEFAULT NULL,
  `snapshotDT` datetime DEFAULT NULL,
  `onfinalityID` varchar(32) DEFAULT NULL,
  `onfinalityStatus` varchar(32) DEFAULT NULL,
  `onfinalityConfig` blob,
  `WSBackfill` varchar(255) DEFAULT NULL,
  `RPCBackfill` varchar(255) DEFAULT NULL,
  `evmRPC` varchar(255) DEFAULT NULL,
  `evmRPCInternal` varchar(255) DEFAULT NULL,
  `isEVM` tinyint(4) DEFAULT '0',
  `blocksCovered` int(11) DEFAULT '1',
  `blocksFinalized` int(11) DEFAULT '1',
  `lastCleanChainTS` int(11) DEFAULT NULL,
  `blocksCleaned` int(11) DEFAULT '0',
  `displayName` varchar(64) DEFAULT NULL,
  `standardAccount` varchar(32) DEFAULT NULL,
  `decimals` varchar(32) DEFAULT '[]',
  `symbols` varchar(32) DEFAULT '[]',
  `website` varchar(128) DEFAULT NULL,
  `coingeckoID` varchar(40) DEFAULT NULL,
  `coingeckoLastUpdateDT` datetime DEFAULT NULL,
  `symbol` varchar(16) DEFAULT NULL,
  `asset` varchar(32) DEFAULT NULL,
  `firstSeenBlockTS` int(11) DEFAULT '0',
  `ss58Format` int(11) DEFAULT '42',
  `crawling` tinyint(4) DEFAULT '0',
  `crawlingStatus` varchar(255) DEFAULT '',
  `lastCrawlDT` datetime DEFAULT NULL,
  `lastFinalizedDT` datetime DEFAULT NULL,
  `lastUpdateChainAssetsTS` int(11) DEFAULT '0',
  `traceTSLast` int(11) DEFAULT '0',
  `backfillLookback` int(11) DEFAULT '1',
  `reindexer` varchar(255) DEFAULT NULL,
  `reindexerCount` tinyint(4) DEFAULT '0',
  `lastUpdateStorageKeysTS` int(11) DEFAULT NULL,
  `iconUrl` varchar(255) DEFAULT NULL,
  `dappURL` varchar(128) DEFAULT NULL,
  `githubURL` varchar(128) DEFAULT NULL,
  `parachainsURL` varchar(128) DEFAULT NULL,
  `subscanURL` varchar(128) DEFAULT NULL,
  `substrateURL` varchar(128) DEFAULT NULL,
  `active` tinyint(4) DEFAULT '0',
  `paraID` int(11) DEFAULT '0',
  `numTraces` int(11) DEFAULT '0',
  `numTraces7d` int(11) DEFAULT '0',
  `numTraces30d` int(11) DEFAULT '0',
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsics7d` int(11) DEFAULT '0',
  `numExtrinsics30d` int(11) DEFAULT '0',
  `numSignedExtrinsics` int(11) DEFAULT '0',
  `numSignedExtrinsics7d` int(11) DEFAULT '0',
  `numSignedExtrinsics30d` int(11) DEFAULT '0',
  `numTransfers` int(11) DEFAULT '0',
  `numTransfers7d` int(11) DEFAULT '0',
  `numTransfers30d` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numEvents7d` int(11) DEFAULT '0',
  `numEvents30d` int(11) DEFAULT '0',
  `valueTransfersUSD` double DEFAULT NULL,
  `valueTransfersUSD7d` double DEFAULT NULL,
  `valueTransfersUSD30d` double DEFAULT NULL,
  `numHolders` int(11) DEFAULT '0',
  `lastBalanceUpdateDT` datetime DEFAULT NULL,
  `assetaddressPallet` varchar(16) DEFAULT NULL,
  `assetNonNativeRegistered` int(11) DEFAULT '0',
  `assetNonNativeUnregistered` int(11) DEFAULT '0',
  `lastUpdateAddressNativeBalanceDT` datetime DEFAULT NULL,
  `totalIssuance` bigint(20) DEFAULT '0',
  `numCrawlBlock` int(11) DEFAULT '0',
  `numCrawlTrace` int(11) DEFAULT '0',
  `numCrawlFeed` int(11) DEFAULT '0',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numTransactionsEVM7d` int(11) DEFAULT '0',
  `numTransactionsEVM30d` int(11) DEFAULT '0',
  `numReceiptsEVM` int(11) DEFAULT '0',
  `numReceiptsEVM7d` int(11) DEFAULT '0',
  `numReceiptsEVM30d` int(11) DEFAULT '0',
  `gasUsed` bigint(20) DEFAULT '0',
  `gasUsed7d` bigint(20) DEFAULT '0',
  `gasUsed30d` bigint(20) DEFAULT '0',
  `gasLimit` bigint(20) DEFAULT '0',
  `gasLimit7d` bigint(20) DEFAULT '0',
  `gasLimit30d` bigint(20) DEFAULT '0',
  `numEVMBlocks` int(11) DEFAULT '0',
  `numEVMBlocks7d` int(11) DEFAULT '0',
  `numEVMBlocks30d` int(11) DEFAULT '0',
  `WSEndpointSelfHosted` tinyint(4) DEFAULT '0',
  `isRelay` int(2) DEFAULT NULL,
  `renewal` tinyint(4) DEFAULT '0',
  `numXCMTransferIncoming` int(11) DEFAULT '0',
  `numXCMTransferIncoming7d` int(11) DEFAULT '0',
  `numXCMTransferIncoming30d` int(11) DEFAULT '0',
  `numXCMTransferOutgoing` int(11) DEFAULT '0',
  `numXCMTransferOutgoing7d` int(11) DEFAULT '0',
  `numXCMTransferOutgoing30d` int(11) DEFAULT '0',
  `valXCMTransferIncomingUSD` double DEFAULT NULL,
  `valXCMTransferIncomingUSD7d` double DEFAULT NULL,
  `valXCMTransferIncomingUSD30d` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD7d` double DEFAULT NULL,
  `valXCMTransferOutgoingUSD30d` double DEFAULT NULL,
  `isWASM` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`chainID`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chainhostnameendpoint`
--

DROP TABLE IF EXISTS `chainhostnameendpoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chainhostnameendpoint` (
  `chainID` int(11) NOT NULL,
  `hostname` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint` tinyint(4) DEFAULT NULL,
  `updateDT` datetime DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  PRIMARY KEY (`chainID`,`hostname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chainparachain`
--

DROP TABLE IF EXISTS `chainparachain`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chainparachain` (
  `chainID` int(11) NOT NULL,
  `relaychain` enum('polkadot','kusama','unknown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paraID` int(11) NOT NULL,
  `parachainID` int(11) DEFAULT NULL,
  `paratype` enum('Parathread','Parachain','Onboarding') COLLATE utf8mb4_unicode_ci DEFAULT 'Parathread',
  `firstSeenDT` datetime DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  PRIMARY KEY (`chainID`,`paraID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `channel`
--

DROP TABLE IF EXISTS `channel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `channel` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `status` enum('Requested','Accepted','Closed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `relayChain` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHashOpenRequest` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtOpenRequest` int(11) DEFAULT NULL,
  `openRequestTS` int(11) DEFAULT NULL,
  `maxMessageSize` int(11) DEFAULT NULL,
  `maxCapacity` int(11) DEFAULT NULL,
  `msgHashAccepted` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtAccepted` int(11) DEFAULT NULL,
  `acceptTS` int(11) DEFAULT NULL,
  `addDT` datetime DEFAULT NULL,
  `msgHashClosing` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtClosing` int(11) DEFAULT NULL,
  `closingInitiatorChainID` int(11) DEFAULT NULL,
  `closingTS` int(11) DEFAULT NULL,
  `symbols` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numXCMMessagesOutgoing1d` int(11) DEFAULT NULL,
  `numXCMMessagesOutgoing7d` int(11) DEFAULT NULL,
  `numXCMMessagesOutgoing30d` int(11) DEFAULT NULL,
  `valXCMMessagesOutgoingUSD1d` double DEFAULT NULL,
  `valXCMMessagesOutgoingUSD7d` double DEFAULT NULL,
  `valXCMMessagesOutgoingUSD30d` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`chainIDDest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clean`
--

DROP TABLE IF EXISTS `clean`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clean` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cnt` int(11) DEFAULT '0',
  PRIMARY KEY (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `coingecko`
--

DROP TABLE IF EXISTS `coingecko`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coingecko` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `symbol` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `crawling` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `coingecko_market_chart`
--

DROP TABLE IF EXISTS `coingecko_market_chart`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coingecko_market_chart` (
  `coingeckoID` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chartDT` date NOT NULL,
  `priceUSD` float DEFAULT NULL,
  `total_volume` float DEFAULT NULL,
  `market_cap` float DEFAULT NULL,
  PRIMARY KEY (`coingeckoID`,`chartDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contract`
--

DROP TABLE IF EXISTS `contract`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contract` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instantiateBN` int(11) DEFAULT NULL,
  `codeHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `constructor` blob,
  `salt` blob,
  `blockTS` int(11) DEFAULT NULL,
  `deployer` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`address`,`chainID`),
  KEY `codeHash` (`codeHash`),
  KEY `blockTS` (`blockTS`),
  KEY `deployer` (`deployer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contractCode`
--

DROP TABLE IF EXISTS `contractCode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractCode` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `metadata` mediumblob,
  `code` mediumblob,
  `addDT` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contractabi`
--

DROP TABLE IF EXISTS `contractabi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractabi` (
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fingerprintID` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `signatureID` varchar(70) COLLATE utf8mb4_unicode_ci NOT NULL,
  `signatureRaw` blob,
  `signature` blob,
  `abi` blob,
  `abiType` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numContracts` int(11) DEFAULT '0',
  `topicLength` int(11) DEFAULT '0',
  PRIMARY KEY (`fingerprintID`),
  KEY `numContracts` (`numContracts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `crowdloan`
--

DROP TABLE IF EXISTS `crowdloan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `crowdloan` (
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `blockNumber` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ts` int(11) DEFAULT NULL,
  `action` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` float DEFAULT NULL,
  `memo` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remark` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paraID` int(11) DEFAULT NULL,
  PRIMARY KEY (`extrinsicHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dapps`
--

DROP TABLE IF EXISTS `dapps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dapps` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `developer` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registered` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dappsName` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dappsdeveloper`
--

DROP TABLE IF EXISTS `dappsdeveloper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dappsdeveloper` (
  `developer` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) DEFAULT NULL,
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`developer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dappsera`
--

DROP TABLE IF EXISTS `dappsera`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dappsera` (
  `era` int(11) NOT NULL,
  `chainID` int(11) NOT NULL,
  `rewards_stakers` decimal(65,18) DEFAULT NULL,
  `rewards_dapps` decimal(65,18) DEFAULT NULL,
  `staked` decimal(65,18) DEFAULT NULL,
  `locked` decimal(65,18) DEFAULT NULL,
  PRIMARY KEY (`era`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dappslog`
--

DROP TABLE IF EXISTS `dappslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dappslog` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `era` int(11) NOT NULL,
  `stake_total` decimal(65,18) DEFAULT NULL,
  `numberOfStakers` int(11) DEFAULT NULL,
  `contractRewardClaimed` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`,`era`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numStars` int(11) DEFAULT '0',
  `numEvents` int(11) DEFAULT '0',
  `numEvents7d` int(11) DEFAULT '0',
  `numEvents30d` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `eventslog`
--

DROP TABLE IF EXISTS `eventslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `eventslog` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `numEvents` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`section`,`method`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `evmtxs`
--

DROP TABLE IF EXISTS `evmtxs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evmtxs` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numStars` int(11) DEFAULT '0',
  `numTransactionsEVM` int(11) DEFAULT '0',
  `numTransactionsEVM7d` int(11) DEFAULT '0',
  `numTransactionsEVM30d` int(11) DEFAULT '0',
  `docs` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `evmtxslog`
--

DROP TABLE IF EXISTS `evmtxslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evmtxslog` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `numTransactionsEVM` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`section`,`method`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extrinsicdocs`
--

DROP TABLE IF EXISTS `extrinsicdocs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `extrinsicdocs` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numStars` int(11) DEFAULT '0',
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsics7d` int(11) DEFAULT '0',
  `numExtrinsics30d` int(11) DEFAULT '0',
  `docs` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extrinsics`
--

DROP TABLE IF EXISTS `extrinsics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `extrinsics` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numStars` int(11) DEFAULT '0',
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsics7d` int(11) DEFAULT '0',
  `numExtrinsics30d` int(11) DEFAULT '0',
  `docs` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valueUSD` double DEFAULT NULL,
  `valueUSD7d` double DEFAULT NULL,
  `valueUSD30d` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extrinsicslog`
--

DROP TABLE IF EXISTS `extrinsicslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `extrinsicslog` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `numExtrinsics` int(11) DEFAULT '0',
  `numExtrinsicsDefi` int(11) DEFAULT '0',
  `valueUSD` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `extrinsicsrecent`
--

DROP TABLE IF EXISTS `extrinsicsrecent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `extrinsicsrecent` (
  `extrinsicID` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date DEFAULT NULL,
  `hr` int(11) DEFAULT NULL,
  `chainID` int(11) NOT NULL,
  `blockNumber` int(11) DEFAULT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ts` int(11) DEFAULT NULL,
  `result` int(11) DEFAULT NULL,
  `signed` int(11) DEFAULT NULL,
  PRIMARY KEY (`chainID`,`extrinsicID`),
  KEY `logDT` (`logDT`,`hr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `follow`
--

DROP TABLE IF EXISTS `follow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `follow` (
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `toAddress` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `followDT` datetime DEFAULT NULL,
  `isFollowing` tinyint(4) DEFAULT '1',
  PRIMARY KEY (`fromAddress`,`toAddress`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `hrmpchannel`
--

DROP TABLE IF EXISTS `hrmpchannel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hrmpchannel` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `status` enum('Requested','Accepted','Closed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `relayChain` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHashOpenRequest` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtOpenRequest` int(11) DEFAULT NULL,
  `openRequestTS` int(11) DEFAULT NULL,
  `maxMessageSize` int(11) DEFAULT NULL,
  `maxCapacity` int(11) DEFAULT NULL,
  `msgHashAccepted` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtAccepted` int(11) DEFAULT NULL,
  `acceptTS` int(11) DEFAULT NULL,
  `addDT` datetime DEFAULT NULL,
  `msgHashClosing` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAtClosing` int(11) DEFAULT NULL,
  `closingInitiatorChainID` int(11) DEFAULT NULL,
  `closingTS` int(11) DEFAULT NULL,
  `symbols` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numXCMMessagesOutgoing1d` int(11) DEFAULT NULL,
  `numXCMMessagesOutgoing7d` int(11) DEFAULT NULL,
  `numXCMMessagesOutgoing30d` int(11) DEFAULT NULL,
  `valXCMMessagesOutgoingUSD1d` double DEFAULT NULL,
  `valXCMMessagesOutgoingUSD7d` double DEFAULT NULL,
  `valXCMMessagesOutgoingUSD30d` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`chainIDDest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `indexlog`
--

DROP TABLE IF EXISTS `indexlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `indexlog` (
  `chainID` int(11) NOT NULL,
  `indexTS` int(11) NOT NULL DEFAULT '0',
  `logDT` date NOT NULL,
  `hr` tinyint(4) NOT NULL,
  `indexDT` datetime DEFAULT NULL,
  `elapsedSeconds` int(11) DEFAULT '0',
  `indexed` tinyint(4) DEFAULT '0',
  `readyForIndexing` tinyint(4) DEFAULT '0',
  `specVersion` int(11) DEFAULT '0',
  `bqExists` tinyint(4) DEFAULT '0',
  `numIndexingErrors` int(11) DEFAULT '0',
  `numIndexingWarns` int(11) DEFAULT '0',
  `attempted` int(11) DEFAULT '0',
  `lastAttemptStartDT` datetime DEFAULT NULL,
  `bqlogExtrinsics` tinyint(4) DEFAULT '0',
  `bqlogEvents` tinyint(4) DEFAULT '0',
  `blockNumberNewSession` int(11) DEFAULT '0',
  `xcmIndexed` tinyint(4) DEFAULT '0',
  `xcmReadyForIndexing` tinyint(4) DEFAULT '0',
  `xcmAttempted` int(11) DEFAULT '0',
  `xcmElapsedSeconds` int(11) DEFAULT '0',
  `xcmIndexDT` datetime DEFAULT NULL,
  `xcmLastAttemptStartDT` datetime DEFAULT NULL,
  `xcmNumIndexingErrors` int(11) DEFAULT '0',
  `xcmNumIndexingWarns` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`indexTS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `indexlog_shadow`
--

DROP TABLE IF EXISTS `indexlog_shadow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `indexlog_shadow` (
  `chainID` int(11) NOT NULL,
  `indexTS` int(11) NOT NULL DEFAULT '0',
  `logDT` date NOT NULL,
  `hr` tinyint(4) NOT NULL,
  `indexDT` datetime DEFAULT NULL,
  `elapsedSeconds` int(11) DEFAULT '0',
  `indexed` tinyint(4) DEFAULT '0',
  `readyForIndexing` tinyint(4) DEFAULT '0',
  `specVersion` int(11) DEFAULT '0',
  `bqExists` tinyint(4) DEFAULT '0',
  `numIndexingErrors` int(11) DEFAULT '0',
  `numIndexingWarns` int(11) DEFAULT '0',
  `attempted` int(11) DEFAULT '0',
  `lastAttemptStartDT` datetime DEFAULT NULL,
  `bqlogExtrinsics` tinyint(4) DEFAULT '0',
  `bqlogEvents` tinyint(4) DEFAULT '0',
  `blockNumberNewSession` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`indexTS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `method`
--

DROP TABLE IF EXISTS `method`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `method` (
  `methodID` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abi` blob,
  `signature` blob,
  `numContracts` int(11) DEFAULT '0',
  PRIMARY KEY (`methodID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `multisigaccount`
--

DROP TABLE IF EXISTS `multisigaccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `multisigaccount` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `threshold` int(11) NOT NULL,
  `signatories` varchar(2048) COLLATE utf8mb4_unicode_ci NOT NULL,
  `signatorycnt` int(11) NOT NULL,
  PRIMARY KEY (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `offer`
--

DROP TABLE IF EXISTS `offer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `offer` (
  `offerID` int(11) NOT NULL,
  `addressSponsor` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `offerURL` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balanceUSDMin` double DEFAULT '100',
  `status` enum('Active','Paused','Deleted') COLLATE utf8mb4_unicode_ci DEFAULT 'Active',
  `description` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reward` float DEFAULT NULL,
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  `targeting` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`offerID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proxyaccount`
--

DROP TABLE IF EXISTS `proxyaccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proxyaccount` (
  `chainID` int(11) NOT NULL,
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `delegate` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proxyType` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `delay` int(11) DEFAULT '0',
  `removed` int(11) DEFAULT '0',
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastcrawlBN` int(11) DEFAULT '1',
  PRIMARY KEY (`chainID`,`address`,`delegate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reindex`
--

DROP TABLE IF EXISTS `reindex`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reindex` (
  `chainID` int(11) NOT NULL,
  `logDT` date NOT NULL,
  `hr` int(11) NOT NULL,
  `cnt` int(11) DEFAULT NULL,
  PRIMARY KEY (`chainID`,`logDT`,`hr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rewards`
--

DROP TABLE IF EXISTS `rewards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rewards` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numRewards` int(11) DEFAULT NULL,
  `numRewards7d` int(11) DEFAULT NULL,
  `numRewards30d` int(11) DEFAULT NULL,
  `valueUSD` double DEFAULT NULL,
  `valueUSD7d` double DEFAULT NULL,
  `valueUSD30d` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rewardsholic`
--

DROP TABLE IF EXISTS `rewardsholic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rewardsholic` (
  `rewardID` int(11) NOT NULL AUTO_INCREMENT,
  `address` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(65,18) DEFAULT NULL,
  `grantDT` datetime DEFAULT NULL,
  `rewardStatus` enum('Granted','Issued') COLLATE utf8mb4_unicode_ci DEFAULT 'Granted',
  `issueDT` datetime DEFAULT NULL,
  PRIMARY KEY (`rewardID`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rewardslog`
--

DROP TABLE IF EXISTS `rewardslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rewardslog` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `numRewards` int(11) DEFAULT NULL,
  `valueUSD` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `router`
--

DROP TABLE IF EXISTS `router`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `router` (
  `routerAssetChain` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) DEFAULT NULL,
  `routerName` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetName` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tvl` double DEFAULT '0',
  PRIMARY KEY (`routerAssetChain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `shadow`
--

DROP TABLE IF EXISTS `shadow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shadow` (
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transferIndex` tinyint(4) NOT NULL DEFAULT '0',
  `xcmIndex` int(11) NOT NULL DEFAULT '0',
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sectionMethod` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainID` int(11) NOT NULL,
  `paraID` int(11) DEFAULT NULL,
  `chainIDDest` int(11) NOT NULL,
  `paraIDDest` int(11) DEFAULT NULL,
  `blockNumber` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rawAsset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nativeAssetChain` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKey` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockNumberDest` int(11) DEFAULT NULL,
  `sourceTS` int(11) DEFAULT NULL,
  `destTS` int(11) DEFAULT NULL,
  `amountSent` decimal(65,18) DEFAULT NULL,
  `amountReceived` decimal(65,18) DEFAULT NULL,
  `amountSentUSD` float DEFAULT NULL,
  `amountReceivedUSD` float DEFAULT NULL,
  `priceUSD` float DEFAULT '0',
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` int(11) DEFAULT NULL,
  `status` enum('NonFinalizedSource','FinalizedSource','NonFinalizedDest','FinalizedDest','Dropped') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `matched` tinyint(4) DEFAULT '0',
  `matchedEventID` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `matchedExtrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incomplete` tinyint(4) DEFAULT '0',
  `isFeeItem` tinyint(4) DEFAULT '0',
  `assetsReceived` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amountReceivedUSD2` float DEFAULT '0',
  `executedEventID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destStatus` tinyint(4) DEFAULT '-1',
  `errorDesc` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`extrinsicHash`,`transferIndex`,`xcmIndex`),
  KEY `sourceTS` (`sourceTS`),
  KEY `asset` (`asset`),
  KEY `chainIDDest` (`chainIDDest`),
  KEY `destAddress` (`destAddress`),
  KEY `matched` (`matched`),
  KEY `m` (`msgHash`,`sentAt`),
  KEY `blockNumber` (`blockNumber`),
  KEY `fromAddress` (`fromAddress`),
  KEY `xcmInteriorKey` (`xcmInteriorKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `specVersions`
--

DROP TABLE IF EXISTS `specVersions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `specVersions` (
  `chainID` int(11) NOT NULL,
  `specVersion` int(11) NOT NULL,
  `blockNumber` int(11) DEFAULT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firstSeenDT` datetime DEFAULT NULL,
  `lastBlockNumber` int(11) DEFAULT '0',
  `metadata` mediumblob,
  PRIMARY KEY (`chainID`,`specVersion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `subaccount`
--

DROP TABLE IF EXISTS `subaccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subaccount` (
  `address` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentKSM` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subNameKSM` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `talismanEndpoint`
--

DROP TABLE IF EXISTS `talismanEndpoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `talismanEndpoint` (
  `paraID` int(11) NOT NULL,
  `relayChain` enum('polkadot','kusama','testnet') COLLATE utf8mb4_unicode_ci NOT NULL,
  `id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainName` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coingeckoID` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prefix` int(11) DEFAULT NULL,
  `decimals` int(11) DEFAULT NULL,
  `symbol` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint2` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WSEndpoint3` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`paraID`,`relayChain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `testParseTraces`
--

DROP TABLE IF EXISTS `testParseTraces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `testParseTraces` (
  `chainID` int(11) NOT NULL,
  `bn` int(11) NOT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `p` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `s` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `k` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `v` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traceType` enum('subscribeStorage','state_traceBlock') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subscribeStorageParseV` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correctValue` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `testGroup` int(11) DEFAULT '1',
  `traceBlockV` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traceBlockParseV` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pass` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`chainID`,`bn`,`s`,`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tmpf`
--

DROP TABLE IF EXISTS `tmpf`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tmpf` (
  `d` decimal(36,18) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `token1155holder`
--

DROP TABLE IF EXISTS `token1155holder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `token1155holder` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL DEFAULT '0',
  `holder` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenID` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(65,18) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastState` blob,
  `metadata` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data` varchar(1204) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `free` float DEFAULT '0',
  PRIMARY KEY (`asset`,`chainID`,`holder`,`tokenID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tokenholder`
--

DROP TABLE IF EXISTS `tokenholder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tokenholder` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL DEFAULT '0',
  `tokenID` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `holder` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `free` decimal(65,18) DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `lastUpdateBN` int(11) DEFAULT '1',
  `lastCrawlBN` int(11) DEFAULT '1',
  `lastState` blob,
  `metadata` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta` blob,
  `tokenURI` blob,
  PRIMARY KEY (`asset`,`chainID`,`tokenID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transfers`
--

DROP TABLE IF EXISTS `transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfers` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numTransfers` int(11) DEFAULT NULL,
  `numTransfers7d` int(11) DEFAULT NULL,
  `numTransfers30d` int(11) DEFAULT NULL,
  `valueUSD` double DEFAULT NULL,
  `valueUSD7d` double DEFAULT NULL,
  `valueUSD30d` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transferslog`
--

DROP TABLE IF EXISTS `transferslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transferslog` (
  `chainID` int(11) NOT NULL,
  `section` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `method` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `numTransfers` int(11) DEFAULT '0',
  `valueUSD` double DEFAULT NULL,
  PRIMARY KEY (`chainID`,`section`,`method`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transfersrecent`
--

DROP TABLE IF EXISTS `transfersrecent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfersrecent` (
  `extrinsicID` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date DEFAULT NULL,
  `hr` int(11) DEFAULT NULL,
  `chainID` int(11) DEFAULT NULL,
  `blockNumber` int(11) DEFAULT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ts` int(11) DEFAULT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `toAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rawAsset` varchar(127) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decimals` int(11) DEFAULT NULL,
  `amount` decimal(65,18) DEFAULT NULL,
  `rawAmount` decimal(65,18) DEFAULT NULL,
  `priceUSD` float DEFAULT '0',
  `amountUSD` float DEFAULT '0',
  PRIMARY KEY (`extrinsicID`),
  KEY `logDT` (`logDT`,`hr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `email` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(130) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createDT` datetime DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wasmCode`
--

DROP TABLE IF EXISTS `wasmCode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wasmCode` (
  `codeHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storer` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wasm` mediumblob,
  `codeStoredBN` int(11) DEFAULT NULL,
  `codeStoredTS` int(11) DEFAULT NULL,
  `metadata` mediumblob,
  `status` enum('Unknown','Unverified','Verified') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `code` mediumblob,
  `language` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `compiler` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`codeHash`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xc20`
--

DROP TABLE IF EXISTS `xc20`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xc20` (
  `asset` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`asset`,`chainID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcm`
--

DROP TABLE IF EXISTS `xcm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcm` (
  `msgHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL DEFAULT '-1',
  `chainIDDest` int(11) NOT NULL DEFAULT '-1',
  `relayedBlockHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sentAt` int(11) NOT NULL DEFAULT '0',
  `relayedAt` int(11) DEFAULT '0',
  `includedAt` int(11) DEFAULT '0',
  `finalized` tinyint(4) DEFAULT '0',
  `msgType` enum('dmp','hrmp','ump','unknown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHex` blob,
  `msgStr` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `path` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `executedEventID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destStatus` tinyint(4) DEFAULT '-1',
  `errorDesc` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionMethod` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetChains` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKeys` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentInclusionFingerprints` blob,
  `instructionFingerprints` blob,
  `parentMsgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentSentAt` int(11) DEFAULT NULL,
  `parentBlocknumber` int(11) DEFAULT NULL,
  `childMsgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `childSentAt` int(11) DEFAULT NULL,
  `childBlocknumber` int(11) DEFAULT NULL,
  `matched` tinyint(4) DEFAULT '0',
  `matchDT` datetime DEFAULT NULL,
  `sourceTS` int(11) DEFAULT NULL,
  `destTS` int(11) DEFAULT NULL,
  `sourceSentAt` int(11) DEFAULT NULL,
  `destSentAt` int(11) DEFAULT NULL,
  `sourceBlocknumber` int(11) DEFAULT NULL,
  `destBlocknumber` int(11) DEFAULT NULL,
  `beneficiaries` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `indexDT` datetime DEFAULT NULL,
  `assetsReceived` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amountSentUSD` float DEFAULT '0',
  `amountReceivedUSD` float DEFAULT '0',
  PRIMARY KEY (`msgHash`,`chainID`,`chainIDDest`,`sentAt`),
  KEY `blockTS` (`blockTS`),
  KEY `msghashsentat` (`msgHash`),
  KEY `extrinsicHash` (`extrinsicHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmConcept`
--

DROP TABLE IF EXISTS `xcmConcept`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmConcept` (
  `chainID` int(11) NOT NULL,
  `xcmConcept` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `paraID` int(11) DEFAULT NULL,
  `relayChain` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `parent` int(11) DEFAULT '1',
  `source` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nativeAssetChain` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`chainID`,`xcmConcept`,`asset`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmViolation`
--

DROP TABLE IF EXISTS `xcmViolation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmViolation` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) DEFAULT NULL,
  `violationType` enum('symbol','signal') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parser` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caller` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `errorcase` varchar(68) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instruction` blob,
  `instructionHash` varchar(68) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourceBlocknumber` int(11) NOT NULL,
  `sourceTS` int(11) DEFAULT NULL,
  `indexDT` datetime DEFAULT NULL,
  PRIMARY KEY (`chainID`,`sourceBlocknumber`,`instructionHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmasset`
--

DROP TABLE IF EXISTS `xcmasset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmasset` (
  `xcmInteriorKey` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nativeAssetChain` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(34) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `xcmchainID` int(11) DEFAULT NULL,
  `addDT` datetime DEFAULT NULL,
  `audited` tinyint(4) DEFAULT '0',
  `decimals` int(11) DEFAULT NULL,
  `isUSD` tinyint(4) DEFAULT '0',
  `numXCMTransfer1d` int(11) DEFAULT '0',
  `numXCMTransfer7d` int(11) DEFAULT '0',
  `numXCMTransfer30d` int(11) DEFAULT '0',
  `valXCMTransferUSD1d` double DEFAULT '0',
  `valXCMTransferUSD7d` double DEFAULT '0',
  `valXCMTransferUSD30d` double DEFAULT '0',
  `coingeckoID` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coingeckoLastUpdateDT` datetime DEFAULT NULL,
  `priceUSD` double DEFAULT '0',
  `priceUSDPercentChange` double DEFAULT '0',
  `verificationPath` blob,
  `liquid` float DEFAULT NULL,
  `lastPriceUpdateDT` datetime DEFAULT NULL,
  `parent` tinyint(4) DEFAULT '1',
  PRIMARY KEY (`symbol`,`relayChain`),
  KEY `xcmInteriorKey` (`xcmInteriorKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmassetlog`
--

DROP TABLE IF EXISTS `xcmassetlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmassetlog` (
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relayChain` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logDT` date NOT NULL,
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `numXCMTransfersOutgoingUSD` int(11) DEFAULT '0',
  `valXCMTransferOutgoingUSD` double DEFAULT NULL,
  PRIMARY KEY (`symbol`,`relayChain`,`logDT`,`chainID`,`chainIDDest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmassetpricelog`
--

DROP TABLE IF EXISTS `xcmassetpricelog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmassetpricelog` (
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relayChain` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `routerAssetChain` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `indexTS` int(11) NOT NULL,
  `xcmInteriorKey` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priceUSD` double DEFAULT NULL,
  `verificationPath` blob,
  `priceUSD10` double DEFAULT NULL,
  `priceUSD100` double DEFAULT NULL,
  `priceUSD1000` double DEFAULT NULL,
  `liquid` float DEFAULT NULL,
  `total_volumes` decimal(36,18) DEFAULT NULL,
  `market_caps` double DEFAULT NULL,
  `path` varchar(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`symbol`,`relayChain`,`indexTS`,`routerAssetChain`),
  KEY `indexTS2` (`symbol`,`relayChain`,`indexTS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmfee`
--

DROP TABLE IF EXISTS `xcmfee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmfee` (
  `relayChain` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmConcept` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `paraID` int(11) DEFAULT NULL,
  `paraIDDest` int(11) DEFAULT NULL,
  `transactExtraWeight` decimal(35,18) DEFAULT NULL,
  `maxWeight` decimal(35,18) DEFAULT NULL,
  `transactExtraWeightSigned` decimal(35,18) DEFAULT NULL,
  `destinationAssetFeePerSecond` decimal(35,18) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmlog`
--

DROP TABLE IF EXISTS `xcmlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmlog` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `logDT` date NOT NULL,
  `numXCMTransfer` int(11) DEFAULT NULL,
  `amountSentUSD` float DEFAULT '0',
  `amountReceivedUSD` float DEFAULT '0',
  PRIMARY KEY (`chainID`,`chainIDDest`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmaplearn`
--

DROP TABLE IF EXISTS `xcmmaplearn`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmaplearn` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `concept` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetChain` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastUpdateDT` datetime DEFAULT NULL,
  `cnt` int(11) DEFAULT '0',
  PRIMARY KEY (`chainID`,`chainIDDest`,`concept`,`assetChain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmessagelog`
--

DROP TABLE IF EXISTS `xcmmessagelog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmessagelog` (
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `logDT` date NOT NULL,
  `numXCMMessagesOutgoingUSD` int(11) DEFAULT '0',
  `valXCMMessagesOutgoingUSD` double DEFAULT '0',
  PRIMARY KEY (`chainID`,`chainIDDest`,`logDT`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmessages`
--

DROP TABLE IF EXISTS `xcmmessages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmessages` (
  `incoming` int(11) NOT NULL,
  `msgHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sentAt` int(11) NOT NULL DEFAULT '0',
  `chainID` int(11) DEFAULT '-1',
  `chainIDDest` int(11) DEFAULT '-1',
  `msgType` enum('dmp','hrmp','ump','unknown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHex` blob,
  `msgStr` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `blockNumber` int(11) NOT NULL,
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `path` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `executedEventID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destStatus` tinyint(4) DEFAULT '-1',
  `errorDesc` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionMethod` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extrinsicTraceID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetChains` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKeys` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentInclusionFingerprints` blob,
  `instructionFingerprints` blob,
  `parentMsgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parentSentAt` int(11) DEFAULT NULL,
  `parentBlocknumber` int(11) DEFAULT NULL,
  `childMsgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `childSentAt` int(11) DEFAULT NULL,
  `childBlocknumber` int(11) DEFAULT NULL,
  `matched` tinyint(4) DEFAULT '0',
  `matchDT` datetime DEFAULT NULL,
  `sourceTS` int(11) DEFAULT NULL,
  `destTS` int(11) DEFAULT NULL,
  `sourceSentAt` int(11) DEFAULT NULL,
  `destSentAt` int(11) DEFAULT NULL,
  `sourceBlocknumber` int(11) DEFAULT NULL,
  `destBlocknumber` int(11) DEFAULT NULL,
  `beneficiaries` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `indexDT` datetime DEFAULT NULL,
  `assetsReceived` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amountSentUSD` float DEFAULT '0',
  `amountReceivedUSD` float DEFAULT '0',
  `connectedTxHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHashAudited` tinyint(4) DEFAULT '-1',
  PRIMARY KEY (`msgHash`,`blockNumber`,`incoming`),
  KEY `blockTS` (`blockTS`),
  KEY `msghashsentat` (`msgHash`,`sentAt`),
  KEY `blockNumber` (`blockNumber`),
  KEY `extrinsicHash` (`extrinsicHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmessagesrecent`
--

DROP TABLE IF EXISTS `xcmmessagesrecent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmessagesrecent` (
  `xcmID` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainIDDest` int(11) DEFAULT NULL,
  `chainID` int(11) DEFAULT NULL,
  `msgType` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incoming` int(11) DEFAULT NULL,
  `msgHex` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgStr` varchar(4096) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `blockNumber` int(11) DEFAULT NULL,
  `sentAt` int(11) DEFAULT NULL,
  `relayChain` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`xcmID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmeta0`
--

DROP TABLE IF EXISTS `xcmmeta0`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmeta0` (
  `blockNumber` int(11) NOT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stateRoot` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmMeta` blob,
  PRIMARY KEY (`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmmeta2`
--

DROP TABLE IF EXISTS `xcmmeta2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmmeta2` (
  `blockNumber` int(11) NOT NULL,
  `blockTS` int(11) DEFAULT NULL,
  `blockHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stateRoot` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmMeta` blob,
  PRIMARY KEY (`blockNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `xcmtransactor_indexToAccount`
--

DROP TABLE IF EXISTS `xcmtransactor_indexToAccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmtransactor_indexToAccount` (
  `chainID` int(11) NOT NULL,
  `indexToAccount` int(11) NOT NULL,
  `relayChain` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addDT` datetime DEFAULT NULL,
  PRIMARY KEY (`chainID`,`indexToAccount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmtransfer`
--

DROP TABLE IF EXISTS `xcmtransfer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmtransfer` (
  `extrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transferIndex` tinyint(4) NOT NULL DEFAULT '0',
  `xcmIndex` int(11) NOT NULL DEFAULT '0',
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sectionMethod` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traceid` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainID` int(11) NOT NULL,
  `paraID` int(11) DEFAULT NULL,
  `chainIDDest` int(11) NOT NULL,
  `paraIDDest` int(11) DEFAULT NULL,
  `blockNumber` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destAddress` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rawAsset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nativeAssetChain` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKey` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blockNumberDest` int(11) DEFAULT NULL,
  `sourceTS` int(11) DEFAULT NULL,
  `destTS` int(11) DEFAULT NULL,
  `amountSent` decimal(65,18) DEFAULT NULL,
  `amountReceived` decimal(65,18) DEFAULT NULL,
  `amountSentUSD` float DEFAULT NULL,
  `amountReceivedUSD` float DEFAULT NULL,
  `priceUSD` float DEFAULT '0',
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msgHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` int(11) DEFAULT NULL,
  `status` enum('NonFinalizedSource','FinalizedSource','NonFinalizedDest','FinalizedDest','Dropped') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `matched` tinyint(4) DEFAULT '0',
  `matchedEventID` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `matchedExtrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incomplete` tinyint(4) DEFAULT '0',
  `isFeeItem` tinyint(4) DEFAULT '0',
  `assetsReceived` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `executedEventID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destStatus` tinyint(4) DEFAULT '-1',
  `errorDesc` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `violation` tinyint(4) DEFAULT '0',
  `pendingXcmInfo` blob,
  `xcmInfo` blob,
  `xcmInfoAudited` tinyint(4) DEFAULT '0',
  `innerCall` blob,
  `xcmType` enum('xcmtransfer','xcmtransact','other') COLLATE utf8mb4_unicode_ci DEFAULT 'xcmtransfer',
  `connectedTxHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`extrinsicHash`,`transferIndex`,`xcmIndex`),
  KEY `sourceTS` (`sourceTS`),
  KEY `asset` (`asset`),
  KEY `chainIDDest` (`chainIDDest`),
  KEY `destAddress` (`destAddress`),
  KEY `matched` (`matched`),
  KEY `m` (`msgHash`,`sentAt`),
  KEY `blockNumber` (`blockNumber`),
  KEY `fromAddress` (`fromAddress`),
  KEY `xcmInteriorKey` (`xcmInteriorKey`),
  KEY `symbol` (`symbol`),
  KEY `xcmType` (`xcmType`),
  KEY `extrinsicID` (`extrinsicID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmtransferdestcandidate`
--

DROP TABLE IF EXISTS `xcmtransferdestcandidate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmtransferdestcandidate` (
  `eventID` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extrinsicID` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chainIDDest` int(11) NOT NULL,
  `fromAddress` varchar(67) COLLATE utf8mb4_unicode_ci NOT NULL,
  `msgHash` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` int(11) DEFAULT '0',
  `blockNumberDest` int(11) DEFAULT NULL,
  `asset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rawAsset` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nativeAssetChain` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `xcmInteriorKey` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relayChain` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destTS` int(11) DEFAULT NULL,
  `amountReceived` decimal(65,18) DEFAULT NULL,
  `matched` tinyint(4) DEFAULT '0',
  `matchedExtrinsicHash` varchar(67) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addDT` datetime DEFAULT NULL,
  `violation` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`eventID`,`fromAddress`),
  KEY `destTS` (`destTS`),
  KEY `asset` (`destTS`),
  KEY `chainIDDest` (`chainIDDest`),
  KEY `fromAddress` (`fromAddress`),
  KEY `matched` (`matched`),
  KEY `extrinsicID` (`extrinsicID`),
  KEY `symbol` (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `xcmtransferroute`
--

DROP TABLE IF EXISTS `xcmtransferroute`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `xcmtransferroute` (
  `asset` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assetDest` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `symbol` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chainID` int(11) NOT NULL,
  `chainIDDest` int(11) NOT NULL,
  `cnt` int(11) DEFAULT NULL,
  `routeDisabled` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`symbol`,`chainID`,`chainIDDest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2022-11-16 21:57:40
