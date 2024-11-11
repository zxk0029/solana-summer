// https://solana.com/developers/guides/token-extensions/metadata-pointer#token-metadata-interface-overview

import {
    LAMPORTS_PER_SOL,
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    clusterApiUrl,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
    LENGTH_SIZE,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TYPE_SIZE,
    ExtensionType,
    createInitializeMetadataPointerInstruction,
    createInitializeMintInstruction,
    getMetadataPointerState,
    getMint,
    getMintLen,
    getTokenMetadata,
    mintTo,
    createAssociatedTokenAccount,
    getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import {
    TokenMetadata,
    pack,
    createInitializeInstruction,
    createRemoveKeyInstruction,
    createUpdateFieldInstruction,
} from '@solana/spl-token-metadata';
import bs58 from 'bs58';

// 配置
const CONFIG = {
    PAYER_SECRET: 'kVpir2Dn2DfF3tJqviGsVqMhnzM88GyXWr3faNQJtXB7cWWT1KVrBgYNMqaQQKJv7ddfip1MmESh687qjWTn6wy',
    DECIMALS: 0,
    METADATA: {
        name: 'Solana Summer',
        symbol: '',
        uri: 'https://ipfs.io/ipfs/QmPDHYbztLwZAZj53XT8aRvZyQxZkkMkZHiVArjgJGVaBX',
        description: 'Forget winter. The sun never sets on Solana.'
    }
};

export class TokenService {
    public connection: Connection;
    public payer: Keypair;

    constructor() {
        this.connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
        if (CONFIG.PAYER_SECRET) {
            this.payer = Keypair.fromSecretKey(bs58.decode(CONFIG.PAYER_SECRET));
        } else {
            this.payer = Keypair.generate();
        }
    }

    async initialize() {
        if (!CONFIG.PAYER_SECRET) {
            console.log('\n=== New Wallet Generated ===\n', {
                publicKey: this.payer.publicKey.toBase58(),
                privateKey: bs58.encode(this.payer.secretKey)
            });

            const airdropSignature = await this.connection.requestAirdrop(
                this.payer.publicKey,
                2 * LAMPORTS_PER_SOL
            );
            await this.connection.confirmTransaction({
                signature: airdropSignature,
                blockhash: (await this.connection.getLatestBlockhash()).blockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
            });

            console.log('\n=== Airdrop Complete ===\n', {
                amount: '2 SOL',
                signature: airdropSignature
            });
        }
    }

    // 创建新代币及其元数据
    async createTokenWithMetadata(): Promise<{ mintAddress: string, signature: string }> {
        const mintKeypair = Keypair.generate();
        const mint = mintKeypair.publicKey;
        const mintAuthority = this.payer.publicKey;
        const updateAuthority = this.payer.publicKey;
        const freezeAuthority = this.payer.publicKey;

        console.log('\n=== Token Creation Details ===\n', {
            mintAddress: mint.toBase58(),
            authorities: {
                mintAuthority: mintAuthority.toBase58(),
                updateAuthority: updateAuthority.toBase58(),
                freezeAuthority: freezeAuthority.toBase58()
            }
        });

        // 准备元数据
        const metaData: TokenMetadata = {
            updateAuthority,
            mint,
            name: CONFIG.METADATA.name,
            symbol: CONFIG.METADATA.symbol,
            uri: CONFIG.METADATA.uri,
            additionalMetadata: [['description', CONFIG.METADATA.description]],
        };

        // 计算所需空间和租金
        // 1. 计算元数据扩展的大小
        const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
        // 2. 计算实际元数据内容长度
        const metadataLen = pack(metaData).length;
        // 3. 计算 mint 账户需要的空间大小
        const mintLen = getMintLen([ExtensionType.MetadataPointer]); // 传统SPL Token（Token Program）使用的是MINT_SIZE=82固定字节大小
        // 4. 计算所需的最小租金
        const lamports = await this.connection.getMinimumBalanceForRentExemption(
            mintLen + metadataExtension + metadataLen,
        );

        // 创建交易指令
        const instructions = [
            // 创建账户
            SystemProgram.createAccount({
                fromPubkey: this.payer.publicKey,
                newAccountPubkey: mint,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            }),
            // 初始化元数据指针
            createInitializeMetadataPointerInstruction(
                mint,
                updateAuthority,
                mint, // 传入数据存放位置（metadataAddress），可以多个token共享一组数据，节省租金
                TOKEN_2022_PROGRAM_ID,
            ),
            // 初始化Mint
            createInitializeMintInstruction(
                mint,
                CONFIG.DECIMALS,
                mintAuthority,
                freezeAuthority,
                TOKEN_2022_PROGRAM_ID,
            ),
            // 初始化元数据
            createInitializeInstruction({
                programId: TOKEN_2022_PROGRAM_ID,
                metadata: mint,
                updateAuthority,
                mint,
                mintAuthority,
                name: metaData.name,
                symbol: metaData.symbol,
                uri: metaData.uri,
            }),
            // 更新元数据字段
            createUpdateFieldInstruction({
                programId: TOKEN_2022_PROGRAM_ID,
                metadata: mint,
                updateAuthority,
                field: metaData.additionalMetadata[0][0],
                value: metaData.additionalMetadata[0][1],
            }),
        ];

        // 发送交易
        const transaction = new Transaction().add(...instructions);
        const signature = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.payer, mintKeypair],
        );

        return {
            mintAddress: mint.toBase58(),
            signature
        };
    }

    // 获取代币元数据
    async getMetadata(mintAddress: string): Promise<void> {
        try {
            const mint = new PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mint);

            if (!accountInfo) {
                throw new Error(`Account ${mintAddress} does not exist`);
            }

            const programId = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
                ? TOKEN_2022_PROGRAM_ID
                : TOKEN_PROGRAM_ID;

            const mintInfo = await getMint(
                this.connection,
                mint,
                'confirmed',
                programId
            );

            console.log('\n=== Mint Details ===\n', {
                mintAddress: mintAddress,
                decimals: mintInfo.decimals,
                freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
                mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
                isInitialized: mintInfo.isInitialized,
                supply: mintInfo.supply.toString()
            });

            try {
                const metadataPointer = getMetadataPointerState(mintInfo);
                const metadata = await getTokenMetadata(this.connection, mint, 'confirmed', programId);
                
                console.log('\n=== Metadata Details ===\n', JSON.stringify({
                    pointer: {
                        authority: metadataPointer?.authority?.toBase58(),
                        metadataAddress: metadataPointer?.metadataAddress?.toBase58()
                    },
                    metadata: {
                        updateAuthority: metadata?.updateAuthority?.toBase58(),
                        mint: metadata?.mint?.toBase58(),
                        name: metadata?.name,
                        symbol: metadata?.symbol,
                        uri: metadata?.uri,
                        additionalMetadata: metadata?.additionalMetadata
                    }
                }, null, 2));
            } catch (error) {
                console.log('\n=== No Metadata Found ===\n');
            }

        } catch (error) {
            console.error('\n=== Error Details ===\n', {
                type: error instanceof Error ? error.name : 'Unknown',
                message: error instanceof Error ? error.message : String(error),
                logs: (error as any)?.logs || [],
                code: (error as any)?.code
            });
            throw error;
        }
    }

    // 更新代币元数据
    async updateMetadata(mintAddress: string, field: string, value: string): Promise<string> {
        try {
            const mint = new PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mint);
            
            if (!accountInfo) {
                throw new Error(`Account ${mintAddress} does not exist`);
            }

            const programId = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
                ? TOKEN_2022_PROGRAM_ID
                : TOKEN_PROGRAM_ID;

            const metadata = await getTokenMetadata(this.connection, mint, "confirmed", programId);
            
            console.log('\n=== Current Metadata ===\n', JSON.stringify({
                updateAuthority: metadata?.updateAuthority?.toBase58(),
                mint: metadata?.mint?.toBase58(),
                name: metadata?.name,
                symbol: metadata?.symbol,
                uri: metadata?.uri,
                additionalMetadata: metadata?.additionalMetadata
            }, null, 2));

            if (!metadata?.updateAuthority) {
                throw new Error('Metadata or update authority not found');
            }

            // 检查是否是修改现有字段
            const isExistingField = metadata.additionalMetadata.some(([key]) => key === field) ||
                ['name', 'symbol', 'uri'].includes(field);

            // 准备指令数组
            const instructions = [];

            // 只有添加新字段时才需要额外的租金
            if (!isExistingField) {
                console.log('\n=== Adding New Field ===\n', {
                    field,
                    value
                });

                const newFieldSize = field.length + value.length + 2; // 2 for separators
                const lamports = await this.connection.getMinimumBalanceForRentExemption(
                    accountInfo.data.length + newFieldSize
                );

                instructions.push(
                    SystemProgram.transfer({
                        fromPubkey: this.payer.publicKey,
                        toPubkey: mint,
                        lamports
                    })
                );
            } else {
                console.log('\n=== Updating Existing Field ===\n', {
                    field,
                    value
                });
            }

            // 添加更新字段指令
            instructions.push(
                createUpdateFieldInstruction({
                    programId: programId,
                    metadata: metadata.mint,
                    updateAuthority: metadata.updateAuthority,
                    field,
                    value,
                })
            );

            const transaction = new Transaction().add(...instructions);
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [this.payer],
            );

            console.log('\n=== Metadata Updated ===\n', {
                field,
                value,
                isNewField: !isExistingField,
                signature,
                viewTransaction: `https://solana.fm/tx/${signature}?cluster=devnet`
            });

            return signature;
        } catch (error) {
            console.error('\n=== Error Details ===\n', {
                type: error instanceof Error ? error.name : 'Unknown',
                message: error instanceof Error ? error.message : String(error),
                logs: (error as any)?.logs || [],
                code: (error as any)?.code
            });
            throw error;
        }
    }

    // 删除元数据字段
    async removeMetadataField(mintAddress: string, key: string): Promise<string> {
        try {
            const mint = new PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mint);
            
            if (!accountInfo) {
                throw new Error(`Account ${mintAddress} does not exist`);
            }

            const programId = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
                ? TOKEN_2022_PROGRAM_ID
                : TOKEN_PROGRAM_ID;

            const metadata = await getTokenMetadata(this.connection, mint, 'confirmed', programId);

            if (!metadata?.updateAuthority) {
                throw new Error('Metadata or update authority not found');
            }

            const instruction = createRemoveKeyInstruction({
                programId: TOKEN_2022_PROGRAM_ID,
                metadata: metadata.mint,
                updateAuthority: metadata.updateAuthority,
                key,
                idempotent: true,
            });

            const transaction = new Transaction().add(instruction);
            return await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [this.payer],
            );
        } catch (error) {
            if (error instanceof Error) {
                console.error('Detailed error:', error.message);
            }
            throw error;
        }
    }

    async mintTokens(mintAddress: string, destinationAddress: string, amount: number) {
        try {
            console.log('\n=== Starting Token Mint ===\n', {
                mintAddress,
                destinationAddress,
                amount
            });

            const mint = new PublicKey(mintAddress);
            const destination = new PublicKey(destinationAddress);
            const mintAuthority = this.payer;

            // 获取账户信息以确定使用哪个程序 ID
            const mintInfo = await this.connection.getAccountInfo(mint);
            if (!mintInfo) {
                throw new Error('Mint account not found');
            }

            const programId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
                ? TOKEN_2022_PROGRAM_ID
                : TOKEN_PROGRAM_ID;

            // 获取或创建关联代币账户(也可以使用 getOrCreateAssociatedTokenAccount，会自动创建账户)
            const associatedTokenAddress = await getAssociatedTokenAddress(
                mint,
                destination,
                false,
                programId
            );

            // 检查代币账户是否存在
            const tokenAccount = await this.connection.getAccountInfo(associatedTokenAddress);

            // 如果代币账户不存在，创建它
            if (!tokenAccount) {
                const createAccount = await createAssociatedTokenAccount(
                    this.connection,
                    this.payer,
                    mint,
                    destination,
                    undefined,
                    programId
                );
                console.log('\n=== Token Account Created ===\n', {
                    associatedTokenAddress: associatedTokenAddress.toBase58(),
                    createdAssociatedTokenAccount: createAccount.toBase58()
                });
            }

            // 铸造代币
            const mintTx = await mintTo(
                this.connection,
                this.payer,
                mint,
                associatedTokenAddress,
                mintAuthority.publicKey,
                amount,
                [],
                undefined,
                programId
            );

            console.log('\n=== Mint Complete ===\n', {
                signature: mintTx,
                viewTransaction: `https://solana.fm/tx/${mintTx}?cluster=devnet`
            });

            return mintTx;
        } catch (error) {
            console.error('\n=== Error Details ===\n', {
                type: error instanceof Error ? error.name : 'Unknown',
                message: error instanceof Error ? error.message : String(error),
                logs: (error as any)?.logs || [],
                code: (error as any)?.code
            });
            throw error;
        }
    }
}