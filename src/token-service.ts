import {
    deserializeMetadata,
    createFungible,
    mplTokenMetadata,
    findMetadataPda,
    createMetadataAccountV3,
    type CreateMetadataAccountV3InstructionAccounts,
    type CreateMetadataAccountV3InstructionArgs,
    updateMetadataAccountV2,
    type UpdateMetadataAccountV2InstructionAccounts,
    type DataV2, MPL_TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import {
    createTokenIfMissing,
    findAssociatedTokenPda,
    getSplAssociatedTokenProgramId,
    mintTokensTo,
    createMintWithAssociatedToken,
} from '@metaplex-foundation/mpl-toolbox';
import {
    transactionBuilder,
    generateSigner,
    percentAmount,
    createGenericFile,
    signerIdentity,
    createSignerFromKeypair,
    publicKey,
    type Umi, sol
} from '@metaplex-foundation/umi';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {irysUploader} from '@metaplex-foundation/umi-uploader-irys';
import {base58} from '@metaplex-foundation/umi/serializers';
import BigNumber from 'bignumber.js';
import fs from 'fs';
import {DataV2Args} from "@metaplex-foundation/mpl-token-metadata/dist/src/generated/types";
import bs58 from "bs58";
import {PublicKey} from "@solana/web3.js";
import {fromWeb3JsPublicKey} from "@metaplex-foundation/umi-web3js-adapters";

export class TokenService {
    private umi: Umi;
    private signer: any;

    constructor(privateKeyBase58: string) {
        // 初始化 UMI
        this.umi = createUmi('https://api.devnet.solana.com')
            .use(mplTokenMetadata())
            .use(irysUploader());

        // 创建 signer
        const privateKey = base58.serialize(privateKeyBase58);
        this.signer = createSignerFromKeypair(
            this.umi,
            this.umi.eddsa.createKeypairFromSecretKey(privateKey)
        );
        this.umi.use(signerIdentity(this.signer, true));
    }

    async uploadImageAndMetadata(
        imagePath: string,
        metadata: {
            name: string;
            symbol: string;
            description: string;
        }
    ): Promise<string> {
        // 上传图片
        const imageFile = fs.readFileSync(imagePath);
        const umiImageFile = createGenericFile(imageFile, 'image.png', {
            tags: [{name: 'Content-Type', value: 'image/png'}],
        });

        console.log('Uploading image to Arweave...');
        const imageUri = await this.umi.uploader.upload([umiImageFile]);

        // 上传元数据
        const metadataJson = {
            name: metadata.name,
            symbol: metadata.symbol,
            description: metadata.description,
            image: imageUri[0],
        };

        console.log('Uploading metadata to Arweave...');
        return await this.umi.uploader.uploadJson(metadataJson);
    }

    // 使用 Metaplex 高级 API 创建代币
    async createTokenWithMetaplex(
        metadata: {
            name: string;
            symbol: string;
            description: string;
        },
        options: {
            imagePath?: string;
            uri?: string;
            decimals?: number;
            amount?: number;
        } = {}
    ): Promise<{signature: string, mintAddress: string, metadataUri: string}> {
        try {
            const { imagePath, uri, decimals = 6, amount = 1000 } = options;
            
            // 获取元数据 URI
            const metadataUri = uri || await this.uploadImageAndMetadata(imagePath!, metadata);
            
            // 创建代币
            const mintSigner = generateSigner(this.umi);

            const createFungibleIx = createFungible(this.umi, {
                mint: mintSigner,
                name: metadata.name,
                uri: metadataUri,
                sellerFeeBasisPoints: percentAmount(0),
                decimals,
            });

            // 创建代币账户
            const createTokenIx = createTokenIfMissing(this.umi, {
                mint: mintSigner.publicKey,
                owner: this.umi.identity.publicKey,
                ataProgram: getSplAssociatedTokenProgramId(this.umi),
            });
            const calcAmount = new BigNumber(amount).times(new BigNumber(10).pow(decimals)).toString();
            // 检查计算结果是否包含小数点，如果包含说明 decimal 设置不正确
            if (calcAmount.indexOf('.') !== -1) throw new Error('decimal 无效');
            // 铸造代币
            const mintTokensIx = mintTokensTo(this.umi, {
                mint: mintSigner.publicKey,
                token: findAssociatedTokenPda(this.umi, {
                    mint: mintSigner.publicKey,
                    owner: this.umi.identity.publicKey,
                }),
                amount: BigInt(calcAmount),
            });

            // 发送交易
            console.log('Sending transaction...');
            const tx = await createFungibleIx
                .add(createTokenIx)
                .add(mintTokensIx)
                .sendAndConfirm(this.umi);

            const signature = base58.deserialize(tx.signature)[0];

            return {
                signature,
                mintAddress: mintSigner.publicKey.toString(),
                metadataUri,
            };
        } catch (error) {
            console.error('Error creating token:', error);
            throw error;
        }
    }

    // 使用低级 API 创建/更新元数据
    async updateMetadata(
        mintAddress: string,
        metadata: {
            name: string;
            symbol: string;
            uri: string;
            sellerFeeBasisPoints?: number;
        }
    ) {
        try {
            const mint = publicKey(mintAddress);
            const [metadataPDA] = findMetadataPda(this.umi, {mint});

            // First fetch existing metadata
            const metadataAccount = await this.umi.rpc.getAccount(metadataPDA);
            if (!metadataAccount.exists) {
                throw new Error('Metadata account does not exist');
            }
            const existingMetadata = deserializeMetadata(metadataAccount);

            const data: DataV2 = {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                sellerFeeBasisPoints: metadata.sellerFeeBasisPoints ?? 0,
                creators: existingMetadata.creators, // Preserve existing creators
                collection: existingMetadata.collection,
                uses: existingMetadata.uses,
            };

            const tx = await updateMetadataAccountV2(this.umi, {
                metadata: metadataPDA,
                updateAuthority: this.signer,
                data,
                isMutable: true,
                primarySaleHappened: true,
            }).sendAndConfirm(this.umi);

            return base58.deserialize(tx.signature)[0];
        } catch (error) {
            console.error('Error updating metadata:', error);
            throw error;
        }
    }

    // 在 TokenService 类中添加这个新方法
    async getMetadata(mintAddress: string) {
        try {
            const mint = publicKey(mintAddress);
            const seed1 = Buffer.from('metadata');
            const seed2 = bs58.decode(MPL_TOKEN_METADATA_PROGRAM_ID.toString())
            const seed3 = bs58.decode(mint.toString())
            const [metadataPDA, _bump] = PublicKey.findProgramAddressSync([seed1, seed2, seed3], new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID));

            // const [metadataPDA] = findMetadataPda(this.umi, { mint });
            // const metadataAccount = await this.umi.rpc.getAccount(metadataPDA);

            const metadataAccount = await this.umi.rpc.getAccount(fromWeb3JsPublicKey(metadataPDA));
            if (!metadataAccount.exists) {
                throw new Error('Metadata account does not exist');
            }
            
            const metadata = deserializeMetadata(metadataAccount);
            
            return {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
                creators: metadata.creators,
            };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            throw error;
        }
    }

    // 使用低级 API 创建代币
    async createTokenWithLowLevel(
        metadata: {
            name: string;
            symbol: string;
            description: string;
        },
        options: {
            imagePath?: string;
            uri?: string;
            decimals?: number;
            amount?: number;
        } = {}
    ): Promise<{signature: string, mintAddress: string, metadataUri: string}> {
        try {
            const { imagePath, uri, decimals = 6, amount = 1000 } = options;
            
            // 获取元数据 URI
            const metadataUri = uri || await this.uploadImageAndMetadata(imagePath!, metadata);

            // 生成 mint 账户
            const mintKeypair = generateSigner(this.umi);
            
            // 计算元数据账户地址
            const [metadataPDA] = findMetadataPda(this.umi, { mint: mintKeypair.publicKey });

            // 创建代币账户
            const accounts: CreateMetadataAccountV3InstructionAccounts = {
                metadata: metadataPDA,
                mint: mintKeypair.publicKey,
                mintAuthority: this.umi.identity,
                payer: this.umi.payer,
                updateAuthority: this.umi.identity,
            };

            // 定义元数据
            const dataV2: DataV2Args = {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadataUri,
                sellerFeeBasisPoints: 0,
                creators: null,
                collection: null,
                uses: null,
            };

            // 创建元数据参数
            const args: CreateMetadataAccountV3InstructionArgs = {
                data: dataV2,
                isMutable: true,
                collectionDetails: null,
            };

            // 构建交易
            const tx = transactionBuilder()
                .add(createMintWithAssociatedToken(this.umi, {
                    mint: mintKeypair,
                    decimals,
                    amount: amount * Math.pow(10, decimals),
                }))
                .add(createMetadataAccountV3(this.umi, {
                    ...accounts,
                    ...args
                }));

            // 发送交易
            const { signature } = await tx.sendAndConfirm(this.umi);
            
            return {
                signature: base58.deserialize(signature)[0],
                mintAddress: mintKeypair.publicKey.toString(),
                metadataUri
            };
        } catch (error) {
            console.error('Error creating token:', error);
            throw error;
        }
    }

    async mintTo(
        mintAddress: string,
        amount: number,
        recipientAddress?: string
    ): Promise<string> {
        try {
            const mint = publicKey(mintAddress);
            const recipient = recipientAddress 
                ? publicKey(recipientAddress)
                : this.umi.identity.publicKey;

            // 找到接收者的代币账户地址
            const recipientAta = findAssociatedTokenPda(this.umi, {
                mint,
                owner: recipient,
            });

            // 创建代币账户（如果不存在）
            const createAtaIx = createTokenIfMissing(this.umi, {
                mint,
                owner: recipient,
                ataProgram: getSplAssociatedTokenProgramId(this.umi),
            });

            // 铸造代币
            const mintTokensIx = mintTokensTo(this.umi, {
                mint,
                token: recipientAta,
                amount: BigInt(amount),
            });

            // 发送交易
            const tx = await transactionBuilder()
                .add(createAtaIx)
                .add(mintTokensIx)
                .sendAndConfirm(this.umi);

            return base58.deserialize(tx.signature)[0];
        } catch (error) {
            console.error('Error minting tokens:', error);
            throw error;
        }
    }

    // 添加 airdrop 辅助方法
    async requestAirdrop(amount: number = 1) {
        try {
            await this.umi.rpc.airdrop(this.umi.identity.publicKey, sol(amount));
            console.log(`Airdrop of ${amount} SOL requested:`, {
                address: this.umi.identity.publicKey.toString()
            });
        } catch (error) {
            console.error('Error requesting airdrop:', error);
            throw error;
        }
    }
}
