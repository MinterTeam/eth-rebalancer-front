export default [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "_nonce",
                "type": "uint256"
            }
        ],
        "name": "Executed",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "contract IERC20",
                "name": "_baseToken",
                "type": "address"
            },
            {
                "internalType": "address[][]",
                "name": "_sellPaths",
                "type": "address[][]"
            },
            {
                "internalType": "uint256[]",
                "name": "_sellMinAmounts",
                "type": "uint256[]"
            },
            {
                "internalType": "address[][]",
                "name": "_buyPaths",
                "type": "address[][]"
            },
            {
                "internalType": "uint256[]",
                "name": "_buyMaxPrices",
                "type": "uint256[]"
            },
            {
                "internalType": "uint256",
                "name": "_buyMaxPriceDenom",
                "type": "uint256"
            },
            {
                "internalType": "uint256[]",
                "name": "_buyShares",
                "type": "uint256[]"
            },
            {
                "internalType": "uint256",
                "name": "_nonce",
                "type": "uint256"
            }
        ],
        "name": "call",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "nonces",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "pancakeRouter",
        "outputs": [
            {
                "internalType": "contract PancakeRouter",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]
