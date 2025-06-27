const crypto = require("crypto");
const { toHex, fromBech32 } = require("@cosmjs/encoding"); // Import toHex dan fromBech32

class UnionInstructionBuilder {
    static generateSalt() { // Menghapus tanda [""]
        // Menggunakan crypto.randomBytes standar
        return '0x' + crypto.randomBytes(32).toString("hex");
    }

    static calculateTimeout() { // Menghapus tanda [""]
        const now = Date.now();
        const expiry = now + 86400000; // 24 jam
        // Konsisten dengan BigInt dan 0xf4240n (1_000_000)
        const timestamp = BigInt(expiry) * 0xf4240n;
        return timestamp.toString(); // Mengembalikan string desimal
    }

    static getTokenConfig(type) { // Menghapus tanda [""]
        const config = {
            'USDC': {
                'denom': "ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4",
                'baseToken': "ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4",
                'baseTokenName': "Noble USDC Token", // Perbaiki nama
                'baseTokenSymbol': "USDC", // Perbaiki simbol
                'baseTokenDecimals': 6,
                'quoteToken': "bbn1lfpplnfqlrdrzd5p54ya28p99v98m9at5rskcsr4he6gcmt0gf4qq3lu39", // Ini alamat CW20 USDC di Babylon?
                'microUnit': 1_000_000,
                'instructionPattern': "usdc"
            },
            'XION': {
                'denom': "uxion",
                'baseToken': "uxion",
                'baseTokenName': "Native XION Token", // Perbaiki nama
                'baseTokenSymbol': "XION",
                'baseTokenDecimals': 6, // **PENTING: Ini diperbaiki dari 0x0 menjadi 6**
                'quoteToken': "bbn1zjjqhxrvx3cqsxt46tf8cjzskjfypve2fu6k3pnt7f7lferf99sqpxpasy", // Ini alamat CW20 XION di Babylon?
                'microUnit': 1_000_000,
                'instructionPattern': "xion"
            },
            'BBN': { // Tambahkan konfigurasi untuk BBN jika digunakan sebagai token transfer utama di Babylon
                'denom': "ubbn",
                'baseToken': "ubbn",
                'baseTokenName': "Native Babylon Token",
                'baseTokenSymbol': "BBN",
                'baseTokenDecimals': 6,
                'microUnit': 1_000_000,
                'instructionPattern': "bbn" // Placeholder, tidak digunakan di sini tapi untuk konsistensi
            }
        };
        return config[type.toUpperCase()];
    }

    // Pola instruksi yang di-hardcode ini SANGAT sensitif.
    // Asumsi: Placeholder di dalamnya adalah untuk alamat bech32 yang di-UTF8-encode lalu di-hex-kan (seperti yang ada di kode Anda).
    // Ini adalah pola yang aneh, biasanya ABI encoding menggunakan byte hex alamat, bukan string bech32 yang di-hex-kan.
    // Jika ini tidak berfungsi, Anda harus mengkonfirmasi format instruksi Union yang sebenarnya.
    static getUSDCInstructionPattern() { // Menghapus tanda [""]
        // Asumsi: Ini adalah pola instruksi untuk XION (USDC) -> Babylon
        // Pola dummy sender: 78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567 (xion16tdm3...) - 86 char
        // Pola dummy receiver: 62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b74687336 (bbn16tdm3...) - 84 char
        // Pola dummy amount: 2710 (10000 desimal)
        // Pola dummy token_address_on_target_chain: 3e62626e316c6670706c6e66716c7264727a6435703534796132387039397639386d3961743572736b6373723468653667636d74306766347171336c7533390000 (bbn1lfppln...) - 82 char
        return "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000004c000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000003e0000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000002b78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b746873360000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000446962632f363439304137454142363130353942464331434444454230353931374444373042444633413631313635343136324131413437444239333044343044384146340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000446962632f363439304137454142363130353942464331434444454230353931374444373042444633413631313635343136324131413437444239333044343044384146340000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000446962632f3634393041374541423631303539424643314344444542303539313744443730424446334136313136353431363241314134374442393330443430443841463400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e62626e316c6670706c6e66716c7264727a6435703534796132387039397639386d3961743572736b6373723468653667636d7430676634717171336c7533390000";
    }

    static getXIONInstructionPattern() { // Menghapus tanda [""]
        // Asumsi: Ini adalah pola instruksi untuk XION (XION) -> Babylon
        // Pola dummy sender: 78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567 (xion16tdm3...) - 86 char
        // Pola dummy receiver: 62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b74687336 (bbn16tdm3...) - 84 char
        // Pola dummy amount: 2710 (10000 desimal)
        // Pola dummy token_address_on_target_chain: 3e62626e317a6a6a7168787276783363717378743436746638636a7a736b6a6679707665326675366b33706e743766376c66657266393973717078706173790000 (bbn1zjjqh...) - 82 char
        return "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000320000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000027100000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000002b78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b746873360000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000057578696f6e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000458494f4e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000478696f6e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e62626e317a6a6a7168787276783363717378743436746638636a7a736b6a6679707665326675366b33706e743766376c66657266393973717078706173790000";
    }

    // Fungsi ini membuat instruksi dinamis untuk XION->Babylon dan Babylon->EVM.
    // Diasumsikan instruksi Babylon->EVM juga menggunakan struktur serupa dan token_address
    // di rantai target perlu di-encode sebagai string hex dari alamat EVM.
    static createDynamicInstructionWithToken(amountMicro, senderBech32, receiverAddress, tokenType, targetTokenAddress = null) {
        const tokenConfig = this.getTokenConfig(tokenType);
        if (!tokenConfig) {
            throw new Error("Unsupported token type: " + tokenType);
        }

        const amountHex = parseInt(amountMicro).toString(16);
        let instructionHex;

        if (tokenConfig.instructionPattern === "usdc") {
            instructionHex = this.getUSDCInstructionPattern();
        } else if (tokenConfig.instructionPattern === "xion") {
            instructionHex = this.getXIONInstructionPattern();
        } else if (tokenType === "BBN") { // Ini untuk Babylon ke EVM
            // Ini adalah pola instruksi untuk Babylon (BBN) -> EVM.
            // Anda perlu menentukan pola yang sesuai di sini.
            // Sebagai placeholder, saya akan menggunakan pola XION dan modifikasi.
            // Idealnya, Anda punya getBBNInstructionPattern() yang terpisah.
            instructionHex = this.getXIONInstructionPattern(); // Contoh: pakai pola XION, nanti dimodifikasi.
            // Placeholder: 2a62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b74687336 (sender bech32 hex)
            // Placeholder: 3e62626e317a6a6a7168787276783363717378743436746638636a7a736b6a6679707665326675366b33706e743766376c66657266393973717078706173790000 (token address bech32 hex, ini harusnya EVM address)
        } else {
            throw new Error("Unknown instruction pattern: " + tokenConfig.instructionPattern);
        }

        // Penggantian jumlah. Pola "2710" adalah 10000.
        // Anda harus memastikan bahwa `amountHex` di-pad sesuai dengan panjang placeholder yang ingin diganti (biasanya 64 char untuk 32 byte).
        // Misalnya, jika placeholder adalah 64 karakter '0', dan amountHex Anda lebih pendek.
        // instructionHex = this.replaceHexField(instructionHex, "0{64}", amountHex.padStart(64, '0'));
        // Mengingat pola Anda menggunakan '2710', kita akan mengganti itu secara langsung.
        instructionHex = instructionHex.replace(/2710/g, amountHex.padStart(4, '0')); // Pad ke 4 char

        // Penggantian Alamat Pengirim (Cosmos/Bech32 -> Hex)
        // senderBech32 adalah alamat bech32 (misal: "xion1...")
        // Kita harus mengubahnya ke hex yang sama dengan placeholder di pattern.
        // Pola dummy sender adalah hex dari string bech32 itu sendiri.
        const senderHexEncoded = toHex(Buffer.from(senderBech32, 'utf8')).slice(2);
        // Pastikan Anda tahu pola yang benar untuk alamat pengirim
        // Ini adalah contoh placeholder yang saya lihat di kode Anda sebelumnya:
        const xionPlaceholder = "78696f6e313674646d33796c6c7677303377766870347437766d38366b796d6a75716661716e7071796567"; // Contoh dari XION
        const babylonPlaceholder = "62626e313674646d33796c6c7677303377766870347437766d38366b796d6a7571666171786b74687336"; // Contoh dari Babylon

        if (instructionHex.includes(xionPlaceholder)) {
            instructionHex = instructionHex.replace(new RegExp(xionPlaceholder, 'g'), senderHexEncoded);
        } else if (instructionHex.includes(babylonPlaceholder)) {
             instructionHex = instructionHex.replace(new RegExp(babylonPlaceholder, 'g'), senderHexEncoded);
        } else {
            // Jika tidak ada placeholder spesifik, mungkin ada placeholder umum 0s.
            // Anda perlu identifikasi placeholder 0s yang mewakili alamat pengirim.
            console.warn("Could not find specific sender address placeholder in instruction pattern.");
            // Example for a generic 20-byte address placeholder:
            // instructionHex = instructionHex.replace(/0{40}/g, senderHexEncoded.slice(-40).padStart(40, '0'));
        }

        // Penggantian Alamat Penerima (Cosmos/Bech32 atau EVM -> Hex)
        let receiverHexEncoded;
        if (receiverAddress.startsWith('0x')) { // Ini adalah alamat EVM
            receiverHexEncoded = receiverAddress.slice(2).toLowerCase(); // Tanpa 0x, lowercase
            // Pad ke 64 karakter jika diperlukan untuk slot data EVM
            // receiverHexEncoded = receiverHexEncoded.padStart(64, '0');
        } else { // Ini adalah alamat Cosmos (misal: "xion1..." atau "bbn1...")
            receiverHexEncoded = toHex(Buffer.from(receiverAddress, 'utf8')).slice(2);
        }

        // Cari placeholder untuk alamat penerima.
        // Asumsi: Placeholder untuk penerima adalah pola bech32 hex-encoded yang mirip dengan sender.
        const xionReceiverPlaceholder = "3f78696f6e31746d733932636d33346c786c6e346b76787732786473676e63756d7a6570723565326575673930766d74797735357a38646a757176776e65653700"; // Contoh XION receiver placeholder
        const babylonReceiverPlaceholder = "3e62626e317a6a6a7168787276783363717378743436746638636a7a736b6a6679707665326675366b33706e743766376c66657266393973717078706173790000"; // Contoh Babylon receiver (quote token) placeholder
        const evmReceiverPlaceholder = "14e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000"; // Contoh EVM receiver (token address) placeholder

        if (instructionHex.includes(xionReceiverPlaceholder)) {
            instructionHex = instructionHex.replace(new RegExp(xionReceiverPlaceholder, 'g'), receiverHexEncoded);
        } else if (instructionHex.includes(babylonReceiverPlaceholder)) {
            instructionHex = instructionHex.replace(new RegExp(babylonReceiverPlaceholder, 'g'), receiverHexEncoded);
        } else if (instructionHex.includes(evmReceiverPlaceholder) && targetTokenAddress) { // Jika ini untuk Babylon ke EVM
            const targetTokenAddressHex = targetTokenAddress.toLowerCase();
            instructionHex = instructionHex.replace(new RegExp(evmReceiverPlaceholder, 'g'), targetTokenAddressHex.padStart(40, '0'));
            // Alamat penerima EVM yang sebenarnya (receiverAddress) mungkin ditempatkan di slot lain atau di dalam data call untuk token
            // instructionHex = instructionHex.replace(new RegExp("SOME_EVM_RECEIVER_ADDRESS_PLACEHOLDER", 'g'), receiverHexEncoded.padStart(40, '0'));
        } else {
            console.warn("Could not find specific receiver address placeholder in instruction pattern.");
            // Example for a generic 20-byte address placeholder:
            // instructionHex = instructionHex.replace(/0{40}/g, receiverHexEncoded.slice(-40).padStart(40, '0'));
        }

        console.log("💰 Amount: " + amountMicro + " micro" + tokenConfig.baseTokenSymbol + " (0x" + amountHex + ')');
        console.log("🪙 Token: " + tokenConfig.baseTokenSymbol + " (" + tokenConfig.baseTokenName + ')');
        console.log("➡️ Sender (raw): " + senderBech32 + ", Hex-encoded: " + senderHexEncoded);
        console.log("⬅️ Receiver (raw): " + receiverAddress + ", Hex-encoded: " + receiverHexEncoded);
        if (targetTokenAddress) {
            console.log("🎯 Target Token Address: " + targetTokenAddress);
        }

        return instructionHex;
    }


    static createSendMessage(options) { // Menghapus tanda [""]
        const {
            channelId,
            senderAddress,
            receiverAddress,
            amount, // ini sudah microAmount
            tokenType, // "USDC", "XION", "BBN"
            targetTokenAddress = null // Ditambahkan untuk Babylon ke EVM
        } = options;

        const tokenConfig = this.getTokenConfig(tokenType);
        if (!tokenConfig) {
            throw new Error("Unsupported token type: " + tokenType);
        }

        const salt = this.generateSalt();
        const timeoutTimestamp = this.calculateTimeout();

        // Pass targetTokenAddress ke createDynamicInstructionWithToken
        const instruction = this.createDynamicInstructionWithToken(
            amount,
            senderAddress,
            receiverAddress,
            tokenType,
            targetTokenAddress
        );

        console.log("🧂 Generated salt: " + salt);
        console.log("⏰ Timeout: " + timeoutTimestamp);
        console.log("🔧 Instruction (first 100 chars): " + instruction.substring(0, 100) + "...");

        return {
            'send': {
                'channel_id': channelId.toString(), // Pastikan string
                'timeout_height': '0',
                'timeout_timestamp': timeoutTimestamp,
                'salt': salt,
                'instruction': '0x' + instruction
            }
        };
    }

    // Fungsi helper untuk mengganti field dalam hex string
    // Ini mungkin tidak diperlukan lagi jika createDynamicInstructionWithToken menangani semua
    static replaceHexField(data, searchPattern, replaceValue, expectedLength = null) {
        let rawData = data.startsWith('0x') ? data.slice(2) : data;
        let rawReplace = replaceValue.startsWith('0x') ? replaceValue.slice(2) : replaceValue;

        if (expectedLength && rawReplace.length !== expectedLength) {
            rawReplace = rawReplace.padStart(expectedLength, '0').slice(-expectedLength);
            console.warn(`[!] Warning: Padding/Trimming replacement value to ${expectedLength} chars.`);
        }

        // Menggunakan RegExp untuk penggantian global (g) dan case-insensitive (i)
        // Pola 'searchPattern' bisa berupa string hex atau regex seperti '0{40}'
        let result = rawData.replace(new RegExp(searchPattern, 'gi'), rawReplace);

        if (result === rawData) {
            console.warn(`[!] Warning: No replacement made for search pattern: ${searchPattern}`);
        }
        return result;
    }
}

module.exports = {
    UnionInstructionBuilder: UnionInstructionBuilder
};
