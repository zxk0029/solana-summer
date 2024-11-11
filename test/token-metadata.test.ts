import { TokenService } from '../src/token-metadata';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getMint, getMetadataPointerState, getTokenMetadata } from '@solana/spl-token';
import bs58 from "bs58";

describe('Token Creation Tests', () => {
    let tokenService: TokenService;

    beforeEach(async () => {
        tokenService = new TokenService();
        await tokenService.initialize();
    });

    it('should create token with metadata', async () => {
        try {
            console.log('\n=== Testing Token Creation with Metadata ===');
            
            const result = await tokenService.createTokenWithMetadata();
            expect(result.mintAddress).toBeDefined();
            expect(result.signature).toBeDefined();
            
            console.log('\n=== Token Created ===\n', {
                mintAddress: result.mintAddress,
                signature: result.signature,
                viewTransaction: `https://solana.fm/tx/${result.signature}?cluster=devnet`
            });
        } catch (error) {
            console.error('Token creation test error:', error);
            throw error;
        }
    }, 30000);
});

describe('Token Metadata Tests', () => {
    let tokenService: TokenService;
    const MINT_ADDRESS = 'CRXsryiq6uy8xDX9RsjBd2ENYPjxeuSbgs3RCT2KNXP2'; // 使用已创建的代币地址

    beforeEach(async () => {
        tokenService = new TokenService();
        await tokenService.initialize();
    });

    it('should get token metadata', async () => {
        try {
            await tokenService.getMetadata(MINT_ADDRESS);
            // 如果没有抛出错误，则测试通过
            expect(true).toBe(true);
        } catch (error) {
            console.error('Get metadata test error:', error);
            throw error;
        }
    }, 10000);

    it('should update token metadata', async () => {
        try {
            const field = 'website';
            const value = 'https://solana.com';
            
            const signature = await tokenService.updateMetadata(MINT_ADDRESS, field, value);
            expect(signature).toBeDefined();
            
            console.log('\n=== Metadata Updated ===\n', {
                field,
                value,
                signature,
                viewTransaction: `https://solana.fm/tx/${signature}?cluster=devnet`
            });

            // 验证更新
            await tokenService.getMetadata(MINT_ADDRESS);
        } catch (error) {
            console.error('Update metadata test error:', error);
            throw error;
        }
    }, 20000);

    it('should remove metadata field', async () => {
        try {
            const key = 'website';
            const signature = await tokenService.removeMetadataField(MINT_ADDRESS, key);
            expect(signature).toBeDefined();
            
            console.log('\n=== Metadata Field Removed ===\n', {
                key,
                signature,
                viewTransaction: `https://solana.fm/tx/${signature}?cluster=devnet`
            });

            // 验证删除
            await tokenService.getMetadata(MINT_ADDRESS);
        } catch (error) {
            console.error('Remove metadata field test error:', error);
            throw error;
        }
    }, 20000);
});

describe('Token Minting Tests', () => {
    let tokenService: TokenService;
    const MINT_ADDRESS = 'CRXsryiq6uy8xDX9RsjBd2ENYPjxeuSbgs3RCT2KNXP2'; // 使用已创建的代币地址

    beforeEach(async () => {
        tokenService = new TokenService();
        await tokenService.initialize();
    });

    it('should mint tokens to new address', async () => {
        try {
            const destinationKeypair = Keypair.generate();
            const destinationAddress = destinationKeypair.publicKey.toBase58();
            
            console.log('\n=== Destination Account ===\n', {
                address: destinationAddress,
                secretKey: bs58.encode(destinationKeypair.secretKey),
                type: 'New Generated Account'
            });

            const amount = 1000;
            const signature = await tokenService.mintTokens(
                MINT_ADDRESS,
                destinationAddress,
                amount
            );

            expect(signature).toBeDefined();

            console.log('\n=== Tokens Minted ===\n', {
                mintAddress: MINT_ADDRESS,
                destinationAddress,
                secretKey: bs58.encode(destinationKeypair.secretKey),
                amount,
                signature,
                viewTransaction: `https://solana.fm/tx/${signature}?cluster=devnet`
            });
        } catch (error) {
            console.error('Mint tokens test error:', error);
            throw error;
        }
    }, 20000);
});