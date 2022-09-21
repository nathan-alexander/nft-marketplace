const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Marketplace", function () {
          let marketplace, nft, deployer, player
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              const accounts = await ethers.getSigners()
              player = accounts[1]
              await deployments.fixture(["all"])
              marketplace = await ethers.getContract("NftMarketplace")
              nft = await ethers.getContract("BasicNft")
              await nft.mintNft()
              await nft.approve(marketplace.address, TOKEN_ID)
          })

          it("lists and can be bought", async function () {
              await marketplace.listItem(nft.address, TOKEN_ID, PRICE)
              const playerConnectedNftMarketplace = marketplace.connect(player)
              expect(
                  await playerConnectedNftMarketplace.buyItem(nft.address, TOKEN_ID, {
                      value: PRICE,
                  })
              ).to.emit("ItemBought")

              const newOwner = await nft.ownerOf(TOKEN_ID)
              const deployerProceeds = await marketplace.getProceeds(deployer)
              assert(newOwner.toString() == player.address)
              assert(deployerProceeds.toString() == PRICE.toString())
          })
          it("cannot be listed for 0", async function () {
              const ZERO_PRICE = ethers.utils.parseEther("0.0")
              await expect(
                  marketplace.listItem(nft.address, TOKEN_ID, ZERO_PRICE)
              ).to.be.revertedWith("PriceMustBeAboveZero")
          })
          it("must be listed to buy", async function () {
              const playerConnectedNftMarketplace = marketplace.connect(player)
              await expect(
                  playerConnectedNftMarketplace.buyItem(nft.address, TOKEN_ID, { value: PRICE })
              ).to.be.revertedWith("NotListed")
          })
          it("must be listed to cancel", async function () {
              await expect(marketplace.cancelListing(nft.address, TOKEN_ID)).to.be.revertedWith(
                  "NotListed"
              )
          })

          it("must be bought for the list price or above", async function () {
              const LESS_THAN_ONE_ETH = ethers.utils.parseEther("0.05")
              await marketplace.listItem(nft.address, TOKEN_ID, PRICE)
              const playerConnectedNftMarketplace = marketplace.connect(player)
              await expect(
                  playerConnectedNftMarketplace.buyItem(nft.address, TOKEN_ID, {
                      value: LESS_THAN_ONE_ETH,
                  })
              ).to.be.revertedWith("PriceNotMet")
          })
          it("allows owner to cancel a listing", async function () {
              await marketplace.listItem(nft.address, TOKEN_ID, PRICE)
              const listedItem = await marketplace.getListing(nft.address, TOKEN_ID)
              expect(await marketplace.cancelListing(nft.address, TOKEN_ID)).to.emit("ItemCanceled")
              const attemptToGetListing = await marketplace.getListing(nft.address, TOKEN_ID)
              assert(listedItem != attemptToGetListing)
          })

          it("must be owner and listed", async function () {
              const NEW_PRICE = ethers.utils.parseEther("0.2")
              await expect(
                  marketplace.updateListing(nft.address, TOKEN_ID, NEW_PRICE)
              ).to.be.revertedWith("NotListed")
              const playerConnectedNftMarketplace = marketplace.connect(player)
              await expect(
                  playerConnectedNftMarketplace.updateListing(nft.address, TOKEN_ID, NEW_PRICE)
              ).to.be.revertedWith("NotOwner")
          })
          it("allows owner to set new price", async function () {
              await marketplace.listItem(nft.address, TOKEN_ID, PRICE)
              const NEW_PRICE = ethers.utils.parseEther("0.2")
              expect(await marketplace.updateListing(nft.address, TOKEN_ID, NEW_PRICE)).to.emit(
                  "ItemListed"
              )

              const [price] = await marketplace.getListing(nft.address, TOKEN_ID)
              assert(price.toString() == NEW_PRICE.toString())
          })
          it("doesn't allow 0 proceeds to withdraw", async function () {
              await expect(marketplace.withdrawProceeds()).to.be.revertedWith("NoProceeds")
          })
          it("allows user to withdraw", async function () {
              await marketplace.listItem(nft.address, TOKEN_ID, PRICE)
              const playerConnectedNftMarketplace = marketplace.connect(player)
              await playerConnectedNftMarketplace.buyItem(nft.address, TOKEN_ID, { value: PRICE })
              const deployerProceedsBefore = await marketplace.getProceeds(deployer)

              const provider = waffle.provider
              const deployerBalanceBefore = await provider.getBalance(deployer)

              const txResponse = await marketplace.withdrawProceeds()
              const transactionReceipt = await txResponse.wait(1)
              const { gasUsed, effectiveGasPrice } = transactionReceipt
              const gasCost = gasUsed.mul(effectiveGasPrice)

              const deployerBalanceAfter = await provider.getBalance(deployer)

              assert(
                  deployerBalanceAfter.add(gasCost).toString() ==
                      deployerProceedsBefore.add(deployerBalanceBefore).toString()
              )
          })
      })
