const { ethers } = require("ethers");
const fs = require('fs').promises;
const path = require("path");
const axios = require("axios");
const { toHex, fromBech32 } = require("@cosmjs/encoding"); // Menggunakan toHex dan fromBech32 dari cosmjs/encoding
const crypto = require("crypto"); // Menggunakan modul crypto standar
const readline = require("readline");
const { DirectSecp256k1Wallet, Registry } = require("@cosmjs/proto-signing");
const { SigningStargateClient, GasPrice, defaultRegistryTypes } = require("@cosmjs/stargate");
const { MsgExecuteContract } = require("cosmjs-types/cosmwasm/wasm/v1/tx");
const { toUtf8 } = require("@cosmjs/encoding"); // Sudah diimpor di atas, tapi tidak apa-apa
const { UnionInstructionBuilder } = require("./union-instruction-builder"); // Pastikan path ini benar!

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

const XION_TESTNET = {
    chainId: "xion-testnet-2",
    rpcEndpoint: "https://rpc.xion-testnet-2.burnt.com/",
    prefix: "xion",
    denom: "uxion",
    gasPrice: GasPrice.fromString("0.025uxion")
};

const BABYLON_TESTNET = {
    chainId: "bbn-test-3",
    rpcEndpoint: "https://babylon-testnet-rpc.nodes.guru",
    prefix: "bbn",
    denom: "ubbn",
    gasPrice: GasPrice.fromString("0.0025ubbn")
};

const DESTINATIONS = {
    corn: { name: "Corn", channelId: 3, tokenAddress: "e53dcec07d16d88e386ae0710e86d9a400f83c31" },
    sepolia: { name: "Sepolia", channelId: 1, tokenAddress: "bd030914ab8d7ab1bd626f09e47c7cc2881550a3" },
    holesky: { name: "Holesky", channelId: 2, tokenAddress: "77b99a27a5fed3bc8fb3e2f1063181f82ec48637" }
};

const provider = new ethers.JsonRpcProvider("https://evm-rpc-testnet.sei-apis.com");

const COLORS = {
    RESET: "\x1b[0m",
    CYAN: "\x1b[36m",
    GREEN: "\x1b[32m",
    RED: "\x1b[31m",
    YELLOW: "\x1b[33m",
    BOLD: "\x1b[1m"
};

const SPINNER = ['-', '\\', '|', '/'];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function displayLoading(message, duration = 1000) {
    let i = 0;
    return new Promise(resolve => {
        const interval = setInterval(() => {
            process.stdout.write(`\r${COLORS.YELLOW}${SPINNER[i++ % SPINNER.length]} ${message}${COLORS.RESET}`);
        }, 100);
        setTimeout(() => {
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(message.length + 2) + '\r');
            resolve();
        }, duration);
    });
}

function clearScreen() {
    console.clear();
}

function displayBanner() {
    clearScreen();
    console.log(`${COLORS.CYAN}${COLORS.BOLD}`);
    console.log(" ===================================================");
    console.log("     UNION V2 UPDATING I WILL ADD MORE SWAPS  ");
    console.log("        LETS FUCK THIS TESTNET BY KAZUHA ");
    console.log(" ===================================================");
    console.log(`${COLORS.RESET}\n`);
}

const MENU_OPTIONS = [
    { label: "SEI to XION SWAP", value: "sei_to_xion" },
    { label: "SEI to CORN SWAP", value: "sei_to_corn" },
    { label: "XION to Babylon SWAP", value: "xion_to_babylon" },
    { label: "Babylon to Others SWAPS", value: "babylon_to_others" },
    { label: "Exit", value: "exit" }
];

async function renderMenu(selectedIndex = 0) {
    displayBanner();
    console.log(`${COLORS.CYAN}Select an option:${COLORS.RESET}`);
    MENU_OPTIONS.forEach((option, index) => {
        const marker = index === selectedIndex ? `${COLORS.GREEN}>${COLORS.RESET}` : " ";
        console.log(`${marker} ${index + 1}. ${option.label}`);
    });
    console.log("\nUse up/down arrow keys to navigate, Enter to select.");
}

async function navigateMenu() {
    let selectedIndex = 0;
    // Set raw mode before first render, but clear any pending input first
    process.stdin.setRawMode(false); // Matikan dulu untuk membersihkan buffer
    await sleep(50); // Sedikit penundaan
    process.stdin.setRawMode(true); // Aktifkan lagi

    renderMenu(selectedIndex);

    return new Promise(resolve => {
        // Hanya atur listener sekali dan pastikan raw mode aktif sepanjang navigasi menu
        process.stdin.setEncoding('utf8');

        const onKey = async (key) => {
            if (key === '\u001B[A') { // Up arrow
                selectedIndex = Math.max(0, selectedIndex - 1);
                renderMenu(selectedIndex);
            } else if (key === '\u001B[B') { // Down arrow
                selectedIndex = Math.min(MENU_OPTIONS.length - 1, selectedIndex + 1);
                renderMenu(selectedIndex);
            } else if (key === '\r') { // Enter
                process.stdin.removeListener('data', onKey); // Hapus listener saat opsi dipilih
                process.stdin.setRawMode(false); // Matikan raw mode setelah pemilihan
                resolve(MENU_OPTIONS[selectedIndex].value);
            } else if (key === '\u0003') { // Ctrl+C
                console.log(`${COLORS.RED}\n[-] Exiting...${COLORS.RESET}`);
                rl.close();
                process.exit(0);
            }
        };

        // Pastikan tidak ada listener duplikat yang ditambahkan
        process.stdin.removeAllListeners('data');
        process.stdin.on('data', onKey);
    });
}

async function getUserInput(prompt) {
    // Matikan raw mode sementara untuk readline, jika sedang aktif
    if (process.stdin.isRaw) {
        process.stdin.setRawMode(false);
    }
    return new Promise(resolve => {
        rl.question(`${COLORS.CYAN}${prompt}${COLORS.RESET}`, answer => {
            resolve(answer.trim());
        });
    });
}

async function getTransferParams(isXionToBabylon = false) {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}Transfer Configuration:${COLORS.RESET}\n`);

    const amountPrompt = isXionToBabylon ? "Enter token amount (e.g., 0.01): " : "Enter SEI amount (default: 0.0001): ";
    const amount = await getUserInput(amountPrompt);
    const count = await getUserInput("Number of transfers (default: 1): ");

    const params = {
        amount: isXionToBabylon ? (amount || "0.01") : (amount || "0.0001"),
        count: parseInt(count) || 1
    };

    if (isNaN(parseFloat(params.amount)) || parseFloat(params.amount) <= 0) {
        throw new Error("Invalid amount. Must be a positive number.");
    }
    if (isNaN(params.count) || params.count < 1) {
        throw new Error("Invalid transfer count. Must be at least 1.");
    }

    console.log(`\n${COLORS.GREEN}[+] Configuration:${COLORS.RESET}`);
    console.log(`   Amount: ${params.amount} ${isXionToBabylon ? "Token" : "SEI"} per transfer`);
    console.log(`   Transfers: ${params.count}`);
    await sleep(1000);
    return params;
}

async function getXionTransferParams() {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}XION to Babylon Transfer:${COLORS.RESET}\n`);
    console.log("Tokens: 1. USDC, 2. XION");
    const tokenChoice = await getUserInput("Select token (1/2): ");
    let tokenType, tokenConfig;
    if (tokenChoice === '1') {
        tokenType = "USDC";
        tokenConfig = UnionInstructionBuilder.getTokenConfig("USDC");
    } else if (tokenChoice === '2') {
        tokenType = "XION";
        tokenConfig = UnionInstructionBuilder.getTokenConfig("XION");
    } else {
        throw new Error("Invalid token choice.");
    }
    const amount = await getUserInput(`Enter ${tokenConfig.baseTokenSymbol} amount (e.g., 0.01): `);
    const count = await getUserInput("Number of transfers (default: 1): ");
    const tokenAmount = parseFloat(amount || "0.01");
    const transferCount = parseInt(count) || 1;
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
        throw new Error("Invalid amount.");
    }
    if (isNaN(transferCount) || transferCount < 1) {
        throw new Error("Invalid transfer count.");
    }
    const microAmount = Math.floor(tokenAmount * tokenConfig.microUnit).toString();
    console.log(`\n${COLORS.GREEN}[+] Configuration:${COLORS.RESET}`);
    console.log(`   Token: ${tokenConfig.baseTokenSymbol}`);
    console.log(`   Amount: ${tokenAmount} ${tokenConfig.baseTokenSymbol} per transfer`);
    console.log(`   Transfers: ${transferCount}`);
    await sleep(1000);
    return { tokenType, tokenConfig, tokenAmount, microAmount, transferCount };
}

async function getBabylonTransferParams() {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}Babylon to Others Transfer:${COLORS.RESET}\n`);
    console.log("Available destinations:");
    Object.keys(DESTINATIONS).forEach((dest, index) => {
        console.log(`   ${index + 1}. ${DESTINATIONS[dest].name} (Channel ${DESTINATIONS[dest].channelId})`);
    });
    let destination;
    while (true) {
        const choice = await getUserInput(`Select destination (1-${Object.keys(DESTINATIONS).length}): `);
        const index = parseInt(choice) - 1;
        const destKeys = Object.keys(DESTINATIONS);
        if (destKeys[index]) {
            destination = destKeys[index];
            console.log(`[+] Selected: ${DESTINATIONS[destination].name}`);
            break;
        }
        console.log("[-] Invalid choice. Try again.");
    }
    const amount = await getUserInput("Enter BBN amount (e.g., 0.001): ");
    const count = await getUserInput("Number of transfers (default: 1): ");
    const delay = await getUserInput("Delay between transactions in seconds (default: 0): ");
    const params = {
        destination,
        amount: amount || "0.001",
        count: parseInt(count) || 1,
        delay: (delay ? parseInt(delay) : 0) * 1000
    };
    if (!DESTINATIONS[params.destination]) {
        throw new Error(`Invalid destination: ${params.destination}`);
    }
    if (isNaN(parseFloat(params.amount)) || parseFloat(params.amount) <= 0) {
        throw new Error("Invalid BBN amount.");
    }
    if (isNaN(params.count) || params.count < 1) {
        throw new Error("Invalid transfer count.");
    }
    if (isNaN(params.delay) || params.delay < 0) {
        throw new Error("Invalid delay.");
    }
    console.log(`\n${COLORS.GREEN}[+] Configuration:${COLORS.RESET}`);
    console.log(`   Destination: ${DESTINATIONS[params.destination].name}`);
    console.log(`   Amount: ${params.amount} BBN per transfer`);
    console.log(`   Transfers: ${params.count}`);
    console.log(`   Delay: ${params.delay / 1000}s`);
    await sleep(1000);
    return params;
}

async function loadWalletConfig() {
    try {
        const walletData = await fs.readFile(path.join(__dirname, "wallet.json"), "utf8");
        const walletJson = JSON.parse(walletData);
        if (!walletJson.wallets || !Array.isArray(walletJson.wallets) || walletJson.wallets.length === 0) {
            throw new Error("Invalid wallet.json format or no wallets found");
        }
        return walletJson.wallets[0]; // Use the first wallet for now
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading wallet.json: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function loadXionWallet() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.xion_privatekey;
        if (!privateKey) throw new Error("XION private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid XION private key format");
        const privateKeyBytes = Uint8Array.from(Buffer.from(formattedPrivateKey.slice(2), "hex"));
        const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, "xion");
        const [account] = await wallet.getAccounts();
        const address = account.address;
        const addressHex = toHex(fromBech32(address).data).slice(2); // Dapatkan hex dari bech32
        // Panjang hex yang dihasilkan dari bech32.data biasanya 40 karakter (20 byte)
        // Jika Union membutuhkan padding 32 byte (64 karakter hex), lakukan di builder.
        return { address, hex: addressHex, wallet };
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading XION wallet: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function loadBabylonWallet() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.babylon_privatekey;
        if (!privateKey) throw new Error("Babylon private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid Babylon private key format");
        const privateKeyBytes = Uint8Array.from(Buffer.from(formattedPrivateKey.slice(2), "hex"));
        const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, "bbn");
        const [account] = await wallet.getAccounts();
        const address = account.address;
        const addressHex = toHex(fromBech32(address).data).slice(2); // Dapatkan hex dari bech32
        // Panjang hex yang dihasilkan dari bech32.data biasanya 40 karakter (20 byte)
        // Jika Union membutuhkan padding 32 byte (64 karakter hex), lakukan di builder.
        return { address, hex: addressHex, wallet };
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading Babylon wallet: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function loadEvmWallet() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.sei_privatekey;
        if (!privateKey) throw new Error("SEI private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid SEI private key format");
        const wallet = new ethers.Wallet(formattedPrivateKey, provider); // Pastikan provider dimasukkan
        const address = wallet.address;
        return { address, wallet };
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading EVM wallet: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function loadBabylonAddress() {
    try {
        const walletConfig = await loadWalletConfig();
        const address = walletConfig.babylon_address;
        if (!address || !address.trim()) throw new Error("Babylon address missing in wallet.json");
        return address.trim();
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading Babylon address: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function initializeSeiWallet() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.sei_privatekey;
        if (!privateKey) throw new Error("SEI private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid SEI private key format");
        return formattedPrivateKey;
    } catch (error) {
        console.error(`${COLORS.RED}[-] Error loading SEI private key: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

function formatSeiValue(amount) {
    const wei = ethers.parseEther(amount.toString());
    return wei.toString(16);
}

// Fungsi to32ByteHex di main.js bisa dihapus jika UnionInstructionBuilder yang menanganinya
// Tapi jika masih digunakan di sini, pastikan itu benar
function to32ByteHex(value) {
    return value.toString(16).padStart(64, '0');
}

// Fungsi replaceField lebih baik dipindahkan ke UnionInstructionBuilder jika itu tugasnya
// atau diubah agar lebih umum
function replaceField(data, search, replace, expectedLength = null) {
    let rawData = data.startsWith('0x') ? data.slice(2) : data;
    let rawSearch = search.startsWith('0x') ? search.slice(2) : search;
    let rawReplace = replace.startsWith('0x') ? replace.slice(2) : replace;

    if (expectedLength && rawReplace.length !== expectedLength) {
        // Ini adalah masalah jika panjangnya tidak cocok!
        console.warn(`[!] Warning: Replacement value length mismatch. Expected ${expectedLength}, got ${rawReplace.length}.`);
        rawReplace = rawReplace.padStart(expectedLength, '0').slice(-expectedLength); // Pad atau potong
    }

    // Menggunakan RegExp untuk penggantian global
    let result = rawData.replace(new RegExp(rawSearch, 'gi'), rawReplace); // 'gi' untuk global dan case-insensitive

    if (result === rawData) {
        console.warn(`[!] Warning: No replacement made for search pattern: ${rawSearch}`);
    }
    return '0x' + result;
}


async function pollPacketHash(txHash, maxRetries = 50, delay = 5000) {
    const headers = {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0"
    };
    const payload = {
        query: `query ($submission_tx_hash: String!) {
            v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
                packet_hash
            }
        }`,
        variables: { submission_tx_hash: txHash.startsWith('0x') ? txHash : '0x' + txHash }
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await displayLoading(`Checking packet hash (attempt ${attempt + 1}/${maxRetries})`, delay);
            const response = await axios.post("https://graphql.union.build/v1/graphql", payload, { headers });
            const transfers = response.data?.data?.v2_transfers;
            if (transfers && transfers.length > 0 && transfers[0].packet_hash) {
                return transfers[0].packet_hash;
            }
        } catch (error) {
            console.error(`${COLORS.RED}[-] Error querying packet hash: ${error.message}${COLORS.RESET}`);
        }
    }
    console.warn(`${COLORS.YELLOW}[-] No packet hash found after ${maxRetries} retries.${COLORS.RESET}`);
    return null;
}

// Fungsi SEI ke XION dan SEI ke CORN akan menggunakan struktur data asli Anda
// karena UnionInstructionBuilder tampaknya belum membuat fungsi khusus untuk EVM.
// Jadi, manipulasi string hex tetap ada di sini untuk SEI swaps.
async function sendSeiToXionTx(amount, seiWallet) {
    try {
        const xionWallet = await loadXionWallet();
        const seiValue = formatSeiValue(amount);
        const nonce = await provider.getTransactionCount(seiWallet.address, "pending");
        const feeData = await provider.getFeeData();
        let maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('20', "gwei");
        let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('1', "gwei");
        if (maxPriorityFeePerGas > maxFeePerGas) {
            maxPriorityFeePerGas = maxFeePerGas;
        }

        let data = "ff0d7c2f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001848e6234b5bf800a18ac4a3bd40883f47485b854764f4e562dec202bba2c57d7b9bca1434b4530600000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000003e00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000038d7ea4c68000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002600000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000001478ff133dd6be81621062971a7b0f142e9f532d51000000000000000000000000000000000000000000000000000000000000000000000000000000000000002b78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e70717965670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000000000000000000000000000000000000000003534549000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035365690000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003f78696f6e31746d733932636d33346c786c6e346b76787732786473676e63756d7a6570723565326575673930766d74797735357a38646a757176776e65653700";
        const salt = toHex(crypto.randomBytes(32)).slice(2); // Menggunakan crypto.randomBytes
        data = replaceField(data, "a18ac4a3bd40883f47485b854764f4e562dec202bba2c57d7b9bca1434b45306", salt, 64); // Panjang 32 byte = 64 karakter hex
        const timeoutTimestampHex = (BigInt(Date.now() + 86400000) * 0xf4240n).toString(16).padStart(64, '0');
        data = replaceField(data, "1848e6234b5bf800", timeoutTimestampHex, 64); // Placeholder untuk timestamp (perlu disesuaikan jika ini bukan 64 char)

        const seiAddressHexPadded = seiWallet.address.slice(2).padStart(64, '0'); // Pad ke 32 byte (64 char)
        data = replaceField(data, "1478ff133dd6be81621062971a7b0f142e9f532d51000000000000000000000000", seiAddressHexPadded, 64); // Asumsi placeholder 32 byte

        const xionAddressHexRaw = xionWallet.hex; // Ini adalah byte hex alamat xion dari fromBech32
        // Pola penggantian '78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567' adalah hex dari string bech32 itu sendiri.
        // Ini adalah masalah desain di instruksi Union jika mereka mengharapkan string bech32 di-hex-kan.
        // Solusi sementara: Jika `xionWallet.hex` adalah byte hex alamat yang benar, kita harus mencari placeholder byte hex yang sebenarnya di data,
        // bukan string bech32 yang di-hex-kan. Namun, karena ini adalah data yang di-hardcode, kita akan mencoba mengganti sesuai pola yang ada.
        // Jika `xionWallet.address` adalah 'xion1abc...', maka `toHex(Buffer.from(xionWallet.address, 'utf8'))` akan menghasilkan pola yang ada.
        // Mari kita asumsikan placeholder ini memang untuk string bech32 yang di-hex-kan, meskipun aneh.
        const xionAddressBech32HexEncoded = toHex(Buffer.from(xionWallet.address, 'utf8')).slice(2);
        data = replaceField(data, "2b78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567", xionAddressBech32HexEncoded, 86); // Panjang 86 karakter

        const seiValueHex = to32ByteHex(seiValue);
        data = replaceField(data, "00000000000000000000000000000000000000000000000000038d7ea4c68000", seiValueHex, 64); // Asumsi placeholder 32 byte

        const tx = {
            to: "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03",
            data: data, // Sudah diawali '0x' dari replaceField
            value: '0x' + seiValue,
            gasLimit: 0x493e0,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            chainId: 1328
        };

        await displayLoading("Sending SEI to XION transaction...");
        console.log(`${COLORS.CYAN}Amount: ${amount} SEI${COLORS.RESET}`);
        const txResponse = await seiWallet.sendTransaction(tx);
        console.log(`${COLORS.GREEN}[+] Hash: ${txResponse.hash}${COLORS.RESET}`);
        console.log(`View: https://seitrace.com/tx/${txResponse.hash}`);
        const receipt = await txResponse.wait();
        console.log(`${COLORS.GREEN}[+] Status: ${receipt.status === 1 ? "Success" : "Failed"}${COLORS.RESET}`);

        if (receipt.status === 1) {
            const packetHash = await pollPacketHash(txResponse.hash);
            if (packetHash) {
                console.log(`${COLORS.GREEN}[+] Packet Hash: ${packetHash}${COLORS.RESET}`);
            }
            return { success: true, hash: txResponse.hash, packetHash };
        }
        return { success: false, hash: txResponse.hash };
    } catch (error) {
        console.error(`${COLORS.RED}[-] SEI to XION Error: ${error.message}${COLORS.RESET}`);
        return { success: false, error: error.message };
    }
}

async function sendSeiToCornTx(amount, seiWallet) {
    try {
        const seiValue = formatSeiValue(amount);
        const nonce = await provider.getTransactionCount(seiWallet.address, "pending");
        const feeData = await provider.getFeeData();
        let maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('20', "gwei");
        let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('1', "gwei");
        if (maxPriorityFeePerGas > maxFeePerGas) {
            maxPriorityFeePerGas = maxFeePerGas;
        }

        let data = "ff0d7c2f000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001847a593844ad7c0c82ddebd23943e322bf17303f3ea6e97c0580f5d199029cbceb86855ef39844300000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000003a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000005af3107a4000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000005af3107a400000000000000000000000000000000000000000000000000000000000000001478ff133dd6be81621062971a7b0f142e9f532d51000000000000000000000000000000000000000000000000000000000000000000000000000000000000001478ff133DD6Be81621062971a7B0f142E9F532d510000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014E86bEd5B0813430DF660D17363B89Fe9Bd8232d8000000000000000000000000";
        const salt = toHex(crypto.randomBytes(32)).slice(2);
        data = replaceField(data, "c82ddebd23943e322bf17303f3ea6e97c0580f5d199029cbceb86855ef398443", salt, 64);
        const timeoutTimestampHex = (BigInt(Date.now() + 86400000) * 0xf4240n).toString(16).padStart(64, '0');
        data = replaceField(data, "1847a593844ad7c0", timeoutTimestampHex, 64);

        const seiAddressHexPadded = seiWallet.address.slice(2).padStart(64, '0');
        data = replaceField(data, "1478ff133dd6be81621062971a7b0f142e9f532d51000000000000000000000000", seiAddressHexPadded, 64);
        data = replaceField(data, "1478ff133DD6Be81621062971a7B0f142E9F532d51000000000000000000000000", seiAddressHexPadded, 64);

        const seiValueHex = to32ByteHex(seiValue);
        data = replaceField(data, "00000000000000000000000000000000000000000000000000005af3107a4000", seiValueHex, 64);

        const tx = {
            to: "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03",
            data: data,
            value: '0x' + seiValue,
            gasLimit: 0x493e0,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            chainId: 1328
        };

        await displayLoading("Sending SEI to CORN transaction...");
        console.log(`${COLORS.CYAN}Amount: ${amount} SEI${COLORS.RESET}`);
        const txResponse = await seiWallet.sendTransaction(tx);
        console.log(`${COLORS.GREEN}[+] Hash: ${txResponse.hash}${COLORS.RESET}`);
        console.log(`View: https://seitrace.com/tx/${txResponse.hash}`);
        const receipt = await txResponse.wait();
        console.log(`${COLORS.GREEN}[+] Status: ${receipt.status === 1 ? "Success" : "Failed"}${COLORS.RESET}`);

        if (receipt.status === 1) {
            const packetHash = await pollPacketHash(txResponse.hash);
            if (packetHash) {
                console.log(`${COLORS.GREEN}[+] Packet Hash: ${packetHash}${COLORS.RESET}`);
            }
            return { success: true, hash: txResponse.hash, packetHash };
        }
        return { success: false, hash: txResponse.hash };
    } catch (error) {
        console.error(`${COLORS.RED}[-] SEI to CORN Error: ${error.message}${COLORS.RESET}`);
        return { success: false, error: error.message };
    }
}

async function createXionSigningClient() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.xion_privatekey;
        if (!privateKey) throw new Error("XION private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid XION private key format");
        const privateKeyBytes = Uint8Array.from(Buffer.from(formattedPrivateKey.slice(2), "hex"));
        const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, "xion");
        const registry = new Registry([...defaultRegistryTypes, ["/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract]]);
        const client = await SigningStargateClient.connectWithSigner(XION_TESTNET.rpcEndpoint, wallet, {
            registry,
            gasPrice: XION_TESTNET.gasPrice
        });
        return { client, wallet };
    } catch (error) {
        console.error(`${COLORS.RED}[-] Failed to create XION signing client: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function createBabylonSigningClient() {
    try {
        const walletConfig = await loadWalletConfig();
        const privateKey = walletConfig.babylon_privatekey;
        if (!privateKey) throw new Error("Babylon private key missing in wallet.json");
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        if (!ethers.isHexString(formattedPrivateKey, 32)) throw new Error("Invalid Babylon private key format");
        const privateKeyBytes = Uint8Array.from(Buffer.from(formattedPrivateKey.slice(2), "hex"));
        const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, "bbn");
        const registry = new Registry([...defaultRegistryTypes, ["/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract]]);
        const client = await SigningStargateClient.connectWithSigner(BABYLON_TESTNET.rpcEndpoint, wallet, {
            registry,
            gasPrice: BABYLON_TESTNET.gasPrice
        });
        return { client, wallet };
    } catch (error) {
        console.error(`${COLORS.RED}[-] Failed to create Babylon signing client: ${error.message}${COLORS.RESET}`);
        throw error;
    }
}

async function executeXionToBabylonTransfer(client, senderAddress, receiverAddress, microAmount, tokenConfig, tokenType, transferIndex, totalTransfers) {
    try {
        await displayLoading(`Processing transfer ${transferIndex}/${totalTransfers}`);
        const msg = UnionInstructionBuilder.createSendMessage({
            channelId: 2, // XION to Babylon channel
            senderAddress,
            receiverAddress,
            amount: microAmount,
            tokenType // "USDC" atau "XION"
        });
        const executeMsg = {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: senderAddress,
                contract: "xion1336jj8ertl8h7rdvnz4dh5rqahd09cy0x43guhsxx6xyrztx292qlzhdk9", // Contract Union di XION
                msg: toUtf8(JSON.stringify(msg)),
                funds: [{ denom: tokenConfig.denom, amount: microAmount }]
            })
        };
        const fee = {
            amount: [{ denom: "uxion", amount: "697" }],
            gas: "696861"
        };
        const result = await client.signAndBroadcast(senderAddress, [executeMsg], fee, `Union ${tokenConfig.baseTokenSymbol} transfer ${transferIndex}`);
        if (result.code === 0) {
            console.log(`Transfer ${transferIndex}/${totalTransfers}`);
            console.log(`${COLORS.GREEN}[+] Hash: ${result.transactionHash}${COLORS.RESET}\n`);
            return { success: true, hash: result.transactionHash };
        } else {
            console.log(`Transfer ${transferIndex}/${totalTransfers}`);
            console.log(`${COLORS.RED}[-] Error: ${result.rawLog}${COLORS.RESET}\n`);
            return { success: false, error: result.rawLog };
        }
    } catch (error) {
        console.log(`Transfer ${transferIndex}/${totalTransfers}`);
        console.log(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}\n`);
        return { success: false, error: error.message };
    }
}

async function sendBabylonTx(amount, destination = "corn") {
    try {
        const destConfig = DESTINATIONS[destination.toLowerCase()];
        if (!destConfig) {
            throw new Error(`Invalid destination: ${destination}`);
        }
        const babylonWallet = await loadBabylonWallet();
        const evmWallet = await loadEvmWallet(); // Penerima di EVM (SEI)
        const receiverEvmAddress = evmWallet.address; // Alamat EVM penerima

        const { client } = await createBabylonSigningClient();
        const [account] = await babylonWallet.wallet.getAccounts();
        const senderAddress = account.address; // Alamat Babylon pengirim

        const microAmount = Math.floor(parseFloat(amount) * 1000000).toString(); // UBBBN is 6 decimals

        // Menggunakan UnionInstructionBuilder.createSendMessage untuk Babylon to Others
        // Ini mengasumsikan createSendMessage di UnionInstructionBuilder dapat menangani
        // instruksi untuk Babylon ke EVM (Corn, Sepolia, Holesky)
        const msg = UnionInstructionBuilder.createSendMessage({
            channelId: destConfig.channelId, // Channel spesifik ke tujuan (Corn, Sepolia, Holesky)
            senderAddress: senderAddress, // Alamat pengirim di Babylon
            receiverAddress: receiverEvmAddress, // Alamat penerima di EVM
            amount: microAmount, // Jumlah token dalam mikro unit
            tokenType: "BBN", // Menunjukkan ini adalah BBN yang dikirim. Anda mungkin perlu menambahkan konfigurasi "BBN" di getTokenConfig jika Union memproses BBN secara khusus.
            targetTokenAddress: destConfig.tokenAddress // Alamat token EVM target di rantai tujuan
        });

        const executeMsg = {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: senderAddress,
                contract: "bbn1336jj8ertl8h7rdvnz4dh5rqahd09cy0x43guhsxx6xyrztx292q77945h", // Kontrak Union di Babylon
                msg: toUtf8(JSON.stringify(msg)),
                funds: [{ denom: "ubbn", amount: microAmount }] // Dana yang dikirim adalah UBBBN
            })
        };

        const fee = {
            amount: [{ denom: "ubbn", amount: "1000" }], // Sesuaikan jika perlu
            gas: "500000" // Sesuaikan jika perlu
        };

        await displayLoading(`Sending Babylon to ${destConfig.name} transaction...`);
        console.log(`${COLORS.CYAN}Amount: ${amount} BBN${COLORS.RESET}`);
        const result = await client.signAndBroadcast(senderAddress, [executeMsg], fee, `Babylon BBN transfer to ${destConfig.name}`);

        if (result.code === 0) {
            console.log(`${COLORS.GREEN}[+] Hash: ${result.transactionHash}${COLORS.RESET}\n`);
            return { success: true, hash: result.transactionHash };
        } else {
            console.log(`${COLORS.RED}[-] Error: ${result.rawLog}${COLORS.RESET}\n`);
            return { success: false, error: result.rawLog };
        }
    } catch (error) {
        console.log(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}\n`);
        return { success: false, error: error.message };
    }
}

async function executeSeiTransfers(params, isXion, seiWallet) {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}SEI to ${isXion ? "XION" : "CORN"} Transfers:${COLORS.RESET}\n`);
    const results = [];
    for (let i = 0; i < params.count; i++) {
        console.log(`Transfer ${i + 1}/${params.count}`);
        const result = isXion ? await sendSeiToXionTx(params.amount, seiWallet) : await sendSeiToCornTx(params.amount, seiWallet);
        results.push(result);
        console.log("\n");
        await sleep(2000);
    }
    console.log(`${COLORS.CYAN}Summary:${COLORS.RESET}`);
    console.log("=================");
    const successes = results.filter(r => r.success).length;
    console.log(`${COLORS.GREEN}[+] Successful: ${successes}${COLORS.RESET}`);
    console.log(`${COLORS.RED}[-] Failed: ${results.length - successes}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}Hashes:${COLORS.RESET}`);
    results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.success ? `${COLORS.GREEN}${r.hash}${COLORS.RESET}` : `${COLORS.RED}${r.error}${COLORS.RESET}`}`);
    });
    await getUserInput("\nPress Enter to continue...");
}

async function executeXionToBabylonTransfers(params) {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}XION to Babylon Transfers:${COLORS.RESET}\n`);
    const xionWallet = await loadXionWallet();
    const babylonAddress = await loadBabylonAddress();
    const { client } = await createXionSigningClient();
    const tokenBalance = await client.getBalance(xionWallet.address, params.tokenConfig.denom);
    const xionBalance = await client.getBalance(xionWallet.address, "uxion"); // Periksa saldo XION untuk gas
    const totalMicroAmount = parseInt(params.microAmount) * params.transferCount;
    const totalGasEstimate = 697 * params.transferCount; // Estimasi gas per transaksi

    console.log(`Checking balances for XION to Babylon transfer:`);
    console.log(`  Required ${params.tokenConfig.baseTokenSymbol}: ${totalMicroAmount / params.tokenConfig.microUnit} ${params.tokenConfig.baseTokenSymbol}`);
    console.log(`  Available ${params.tokenConfig.baseTokenSymbol}: ${parseInt(tokenBalance.amount) / params.tokenConfig.microUnit} ${params.tokenConfig.baseTokenSymbol}`);
    console.log(`  Required XION for Gas: ${totalGasEstimate / 1_000_000} UXION`);
    console.log(`  Available XION for Gas: ${parseInt(xionBalance.amount) / 1_000_000} UXION`);


    if (parseInt(tokenBalance.amount) < totalMicroAmount) {
        throw new Error(`Insufficient ${params.tokenConfig.baseTokenSymbol}! Available: ${parseInt(tokenBalance.amount) / params.tokenConfig.microUnit}, Required: ${totalMicroAmount / params.tokenConfig.microUnit}`);
    }
    if (parseInt(xionBalance.amount) < totalGasEstimate) {
        throw new Error(`Insufficient XION for gas! Available: ${parseInt(xionBalance.amount) / 1_000_000}, Required: ${totalGasEstimate / 1_000_000}`);
    }

    const results = [];
    for (let i = 1; i <= params.transferCount; i++) {
        const result = await executeXionToBabylonTransfer(
            client,
            xionWallet.address,
            babylonAddress,
            params.microAmount,
            params.tokenConfig,
            params.tokenType,
            i,
            params.transferCount
        );
        results.push(result);
        await sleep(1000);
    }
    console.log(`${COLORS.CYAN}Summary:${COLORS.RESET}`);
    console.log("=================");
    const successes = results.filter(r => r.success).length;
    console.log(`${COLORS.GREEN}[+] Successful: ${successes}${COLORS.RESET}`);
    console.log(`${COLORS.RED}[-] Failed: ${results.length - successes}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}Hashes:${COLORS.RESET}`);
    results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.success ? `${COLORS.GREEN}${r.hash}${COLORS.RESET}` : `${COLORS.RED}${r.error}${COLORS.RESET}`}`);
    });
    await getUserInput("\nPress Enter to continue...");
}

async function executeBabylonToOthersTransfers(params) {
    clearScreen();
    displayBanner();
    console.log(`${COLORS.CYAN}Babylon to ${DESTINATIONS[params.destination].name} Transfers:${COLORS.RESET}\n`);

    const babylonWallet = await loadBabylonWallet();
    const { client } = await createBabylonSigningClient();
    const bbnBalance = await client.getBalance(babylonWallet.address, "ubbn");
    const totalMicroAmount = Math.floor(parseFloat(params.amount) * 1000000) * params.count; // Total amount BBN
    const totalGasEstimate = 1000 * params.count; // Estimasi gas per transaksi

    console.log(`Checking balances for Babylon to ${DESTINATIONS[params.destination].name} transfer:`);
    console.log(`  Required BBN: ${totalMicroAmount / 1_000_000} UBBBN`);
    console.log(`  Available BBN: ${parseInt(bbnBalance.amount) / 1_000_000} UBBBN`);
    console.log(`  Required UBBBN for Gas: ${totalGasEstimate / 1_000_000} UBBBN`);
    // Babylon uses UBBBN for gas
    if (parseInt(bbnBalance.amount) < (totalMicroAmount + totalGasEstimate)) {
        throw new Error(`Insufficient BBN! Available: ${parseInt(bbnBalance.amount) / 1_000_000}, Required: ${(totalMicroAmount + totalGasEstimate) / 1_000_000}`);
    }

    const results = [];
    for (let i = 0; i < params.count; i++) {
        if (i > 0 && params.delay > 0) {
            await displayLoading(`Waiting ${params.delay / 1000}s before next transfer`, params.delay);
        }
        console.log(`Transfer ${i + 1}/${params.count}`);
        const result = await sendBabylonTx(params.amount, params.destination);
        results.push(result);
        console.log("\n");
    }
    console.log(`${COLORS.CYAN}Summary:${COLORS.RESET}`);
    console.log("=================");
    const successes = results.filter(r => r.success).length;
    console.log(`${COLORS.GREEN}[+] Successful: ${successes}${COLORS.RESET}`);
    console.log(`${COLORS.RED}[-] Failed: ${results.length - successes}${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}Hashes:${COLORS.RESET}`);
    results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.success ? `${COLORS.GREEN}${r.hash}${COLORS.RESET}` : `${COLORS.RED}${r.error}${COLORS.RESET}`}`);
    });
    await getUserInput("\nPress Enter to continue...");
}


async function main() {
    try {
        const privateKey = await initializeSeiWallet();
        const seiWallet = new ethers.Wallet(privateKey, provider);
        while (true) {
            const choice = await navigateMenu();
            switch (choice) {
                case 'sei_to_xion':
                    try {
                        const params = await getTransferParams();
                        await executeSeiTransfers(params, true, seiWallet);
                    } catch (error) {
                        console.error(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}`);
                        await getUserInput("\nPress Enter to continue...");
                    }
                    break;
                case 'sei_to_corn':
                    try {
                        const params = await getTransferParams();
                        await executeSeiTransfers(params, false, seiWallet);
                    } catch (error) {
                        console.error(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}`);
                        await getUserInput("\nPress Enter to continue...");
                    }
                    break;
                case 'xion_to_babylon':
                    try {
                        const params = await getXionTransferParams();
                        await executeXionToBabylonTransfers(params);
                    } catch (error) {
                        console.error(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}`);
                        await getUserInput("\nPress Enter to continue...");
                    }
                    break;
                case 'babylon_to_others':
                    try {
                        const params = await getBabylonTransferParams();
                        await executeBabylonToOthersTransfers(params);
                    } catch (error) {
                        console.error(`${COLORS.RED}[-] Error: ${error.message}${COLORS.RESET}`);
                        await getUserInput("\nPress Enter to continue...");
                    }
                    break;
                case 'exit':
                    console.log(`${COLORS.CYAN}[-] Exiting...${COLORS.RESET}`);
                    rl.close();
                    process.exit(0);
            }
        }
    } catch (error) {
        console.error(`${COLORS.RED}[-] Initialization Error: ${error.message}${COLORS.RESET}`);
        rl.close();
        process.exit(1);
    }
}

main().catch(console.error);
