# Solana Token Service

一个用于在 Solana 区块链上创建和管理代币的 TypeScript 服务库。支持通过 Metaplex 标准和原生 SPL Token 标准创建代币。

## 功能特点

- 支持两种代币创建标准：
  - Metaplex 标准（支持链上元数据）
  - SPL Token 2022 标准（支持元数据指针）
- 支持代币元数据管理
- 支持图片和元数据上传到 Arweave
- 支持代币铸造（Mint）功能
- 支持元数据更新和字段管理

## 安装

```bash
ppnpm install @solana/web3.js @solana/spl-token @metaplex-foundation/mpl-token-metadata
```

## 使用方法

### 1. Metaplex 标准创建代币

```typescript
import { TokenService } from './token-service';

// 初始化服务
const tokenService = new TokenService('your_private_key_base58');

// 使用本地图片创建代币
const result = await tokenService.createTokenWithMetaplex(
    {
        name: "My Token",
        symbol: "MTK",
        description: "My first token on Solana"
    },
    {
        imagePath: "./path/to/image.png",
        decimals: 6,
        amount: 1000
    }
);

// 使用已有的元数据 URI 创建代币
const result = await tokenService.createTokenWithMetaplex(
    {
        name: "My Token",
        symbol: "MTK",
        description: "My first token on Solana"
    },
    {
        uri: "https://arweave.net/xxx",
        decimals: 6,
        amount: 1000
    }
);

// 铸造代币
const signature = await tokenService.mintTo(
    mintAddress,
    100 * 10**6,  // 数量
    "recipientAddress" // 可选
);

// 获取代币元数据
const metadata = await tokenService.getMetadata(mintAddress);
```

### 2. SPL Token 2022 标准创建代币

```typescript
import { TokenService } from './token-metadata';

// 初始化服务
const tokenService = new TokenService();
await tokenService.initialize(); // 如果需要，会自动请求测试网 SOL

// 创建代币
const { mintAddress, signature } = await tokenService.createTokenWithMetadata();

// 更新元数据
await tokenService.updateMetadata(
    mintAddress,
    "description",
    "New description"
);

// 铸造代币
await tokenService.mintTokens(
    mintAddress,
    destinationAddress,
    amount
);

// 获取代币信息
await tokenService.getMetadata(mintAddress);
```

## API 说明

### Metaplex 标准 API

#### `createTokenWithMetaplex(metadata, options)`
创建新代币，支持上传图片或使用已有 URI。

参数：
- `metadata`: 代币元数据对象
  - `name`: 代币名称
  - `symbol`: 代币符号
  - `description`: 代币描述
- `options`: 创建选项
  - `imagePath?`: 图片路径
  - `uri?`: 元数据 URI
  - `decimals?`: 精度
  - `amount?`: 初始数量

#### `createTokenWithLowLevel(metadata, options)`
使用低级 API 创建代币，参数同上。

#### `mintTo(mintAddress, amount, recipientAddress?)`
铸造代币到指定地址。

### SPL Token 2022 标准 API

#### `createTokenWithMetadata()`
创建新代币及其元数据。

#### `updateMetadata(mintAddress, field, value)`
更新代币元数据字段。

#### `removeMetadataField(mintAddress, key)`
删除元数据字段。

#### `mintTokens(mintAddress, destinationAddress, amount)`
铸造代币到指定地址。

## 注意事项

- 确保有足够的 SOL 支付交易费用
- Metaplex 标准上传到 Arweave 需要一定时间
- SPL Token 2022 的元数据存储在链上，需要额外的租金
- 建议在使用前先在 Devnet 测试
- 私钥请妥善保管，不要泄露

## 开发

```bash
# 安装依赖
ppnpm install

# 运行测试
ppnpm test
```

## 测试

项目包含两套完整的测试：Metaplex 标准和 SPL Token 2022 标准的测试用例。

### 运行测试

```bash
pnpm test                    # 运行所有测试
pnpm test token-service     # 只运行 Metaplex 标准测试
pnpm test token-metadata    # 只运行 SPL Token 2022 标准测试
```

### Metaplex 标准测试用例 (token-service.test.ts)

测试覆盖以下功能：
1. 代币创建
   - 使用提供的 URI 创建代币
   - 使用本地图片创建代币
   - 使用低级 API 创建代币
2. 元数据管理
   - 更新代币元数据
   - 获取代币元数据
3. 代币铸造
   - 铸造额外代币到指定地址

```typescript
// 创建代币测试示例
it('should create token with provided URI', async () => {
    const result = await tokenService.createTokenWithMetaplex(metadata, {
        uri: 'https://example.com/metadata.json'
    });
    expect(result.signature).toBeDefined();
});
```

### SPL Token 2022 标准测试用例 (token-metadata.test.ts)

测试覆盖以下功能：
1. 代币创建
   - 创建带元数据的代币
2. 元数据管理
   - 获取代币元数据
   - 更新元数据字段
   - 删除元数据字段
3. 代币铸造
   - 铸造代币到新地址

```typescript
// 更新元数据测试示例
it('should update token metadata', async () => {
    const signature = await tokenService.updateMetadata(
        MINT_ADDRESS,
        'website',
        'https://solana.com'
    );
    expect(signature).toBeDefined();
});
```

### 测试配置

- 测试运行在 Solana Devnet 网络
- 测试需要一个有效的私钥（可以在测试文件中配置）
- 部分测试用例需要预先创建的代币地址
- 上传图片测试需要在 `test/assets` 目录下存在测试图片

### 注意事项

1. 运行测试前确保有足够的 Devnet SOL
2. 某些测试可能需要较长时间（如上传到 Arweave）
3. 建议首次运行时使用较长的超时时间（如 30000ms）
4. 测试文件中的 mint 地址需要替换为实际创建的代币地址


## 许可证

MIT