import {TokenService} from '../src/token-service';
import path from 'path';

describe('TokenService', () => {
    let tokenService: TokenService;
    const mockPrivateKey = '3bX9LJYXq4n1qSBd6aAJsMvVicZnC8rP7TiBCMRjkDRgTCCwdbGWtAUgnRSLEmoVDtJv9tg99FuiwDPmFKtz8PoD';

    beforeEach(() => {
        tokenService = new TokenService(mockPrivateKey);
    });

    describe('createTokenWithMetaplex', () => {
        it('should create token with provided URI', async () => {
            const metadata = {
                name: 'Solana Summer',
                symbol: '',
                description: 'Forget winter. The sun never sets on Solana.'
            };
            const result = await tokenService.createTokenWithMetaplex(metadata, {
                uri: 'uri:https://ipfs.io/ipfs/QmPDHYbztLwZAZj53XT8aRvZyQxZkkMkZHiVArjgJGVaBX',
                decimals: 6,
                amount: 1000
            });
            console.log('Token created with provided URI:', {
                signature: result.signature,
                mintAddress: result.mintAddress,
                metadataUri: result.metadataUri
            });
        });
        it('should create token with image upload', async () => {
            const metadata = {
                name: 'Solana Summer',
                symbol: '',
                description: 'Forget winter. The sun never sets on Solana.'
            };

            const result = await tokenService.createTokenWithMetaplex(metadata, {
                imagePath: path.join(__dirname, '../image.png'),
                decimals: 6,
                amount: 1000
            });
            console.log('Token created with image upload:', {
                signature: result.signature,
                mintAddress: result.mintAddress,
                metadataUri: result.metadataUri
            }, 30000);

            it('should create token using low level API', async () => {
                // 准备测试数据
                const imagePath = path.join(__dirname, '../image.png');
                const metadata = {
                    name: 'Test Low Level',
                    symbol: 'TTL',
                    description: 'A test token created with low level API'
                };
                const decimals = 6;
                const amount = 200;

                // 调用创建代币方法
                const result = await tokenService.createTokenWithLowLevel(metadata, {
                    uri: 'https://ipfs.io/ipfs/QmPDHYbztLwZAZj53XT8aRvZyQxZkkMkZHiVArjgJGVaBX',
                    decimals: 6,
                    amount: 1000
                });

                // 验证返回结果
                expect(result.signature).toBeDefined();
                expect(result.mintAddress).toBeDefined();
                expect(result.metadataUri).toBeDefined();
                expect(result.metadataUri).toContain('https://');

                console.log('Token created with low level API:', {
                    signature: result.signature,
                    mintAddress: result.mintAddress,
                    metadataUri: result.metadataUri
                });
            }, 30000); // 设置超时时间为30秒，因为上传到 Arweave 可能需要较长时间
        });

        describe('updateMetadata', () => {
            it('should update token metadata', async () => {
                const mintAddress = "djvRYuokPbDaxCYnAamhi2PcN4EnUc2gSBxnp5SP1s2"

                const signature = await tokenService.updateMetadata(
                    mintAddress,
                    {
                        name: 'Updated Solana Summer',
                        symbol: 'USS',
                        uri: 'https://arweave.net/87H6RRiHukzoFiRduKgWrXn8Vmag5mfRZvuU5fjMdtn6',
                        sellerFeeBasisPoints: 100  // 1%
                    }
                );

                console.log('\nMetadata Update Complete');
                console.log('View Update Transaction:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
            }, 300000);
        });

        describe('getMetadata', () => {
            it('should fetch token metadata', async () => {
                const mintAddress = "djvRYuokPbDaxCYnAamhi2PcN4EnUc2gSBxnp5SP1s2";  // 替换为你的 mint address

                const metadata = await tokenService.getMetadata(mintAddress);

                console.log('\nToken Metadata:');

                const metadataInfo = {
                    'Name': metadata.name,
                    'Symbol': metadata.symbol,
                    'URI': metadata.uri,
                    'Seller Fee': `${metadata.sellerFeeBasisPoints / 100}%`
                }
                console.log(metadataInfo);
            }, 30000);
        });

        it('should mint additional tokens', async () => {
            const mintAddress = "5JVTzSrA4pSYeXFXh4G5UJRCPrsMF6jbfUniwso1Scjn"
            const recipient = "BtZyCCQiQY3G2YqGm5otiEvcaer74tNXH7RbhoGKyVWo"
            // 铸造额外的代币
            const mintAmount = 100 * Math.pow(10, 6); // 100 tokens with 6 decimals
            const mintResult = await tokenService.mintTo(
                mintAddress,
                mintAmount,
                recipient
            );

            expect(mintResult).toBeDefined();
            console.log('Minted additional tokens:', {
                mintAddress: mintAddress,
                signature: mintResult,
                amount: mintAmount
            });
        }, 30000);

    });
});