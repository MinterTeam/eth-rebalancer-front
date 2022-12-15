<script setup>
import {computed, reactive, ref, watch} from "vue";
import Web3 from 'web3';
import erc20Abi from "@/erc20.abi";
import pancakeAbi from "@/pancake.abi";
import axios from "axios";
import { getCurrentInstance } from 'vue'
const instance = getCurrentInstance();

const USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const PANCAKE_ADDRESS = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const slippage = "0.5";
const ONEINCH_BASE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const rpcURL = 'https://bsc-dataseed1.binance.org/'
const web3 = new Web3(rpcURL)

let walletAddress = ref("0xE514c6F3b8C7EC9d523669aAb23Da4883f3eae8F");
let loading = ref(false);

let pancake = await new web3.eth.Contract(pancakeAbi, PANCAKE_ADDRESS)

let inputs = reactive([]);
function newInput() {
  inputs.push({})
}

let outputs = reactive([]);
function newOutput() {
  outputs.push({})
}

function toBN(number) {
  return web3.utils.toBN(number)
}

function recalcInputPercentages() {
  let total = inputs.reduce((acc, input) => acc + fromWei(input.usd), 0);

  inputs.forEach(input => input.percentage = (fromWei(input.usd) / total).toFixed(2));
  inputs.sort((a, b) => b.percentage - a.percentage);
}

async function estimateAmount(address, amount) {
  if (address.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
    return amount
  }

  let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+address+"&fromTokenAddress=0x55d398326f99059ff775485246999027b3197955&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true")

  return res.data.toTokenAmount
}

async function estimateUSDT(address, amount) {
  if (address.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
    return amount
  }

  let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress=0x55d398326f99059ff775485246999027b3197955&fromTokenAddress="+address+"&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true")

  return res.data.toTokenAmount
}

async function updateOutputAmounts() {
  loading = true;

  let USDTBalance = await (new web3.eth.Contract(erc20Abi, USDT_ADDRESS)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();

  await Promise.all(outputs.map(async (output) => {
    let contract = new web3.eth.Contract(erc20Abi, output.address);
    let decimals = await contract.methods.decimals().call();

    let usdAmount = toBN(USDTBalance).muln(Number(output.percentage)).divn(100);

    let price = (await axios.get("https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?contract_addresses="+output.address+"&vs_currencies=usd")).data[output.address.toLowerCase()].usd;
    output.marketAmount = Number(web3.utils.fromWei(usdAmount)) / Number(price);
    output.amount = (await estimateAmount(output.address, usdAmount)) / 10 ** decimals;
    output.slippage = Math.abs((output.amount - output.marketAmount) / output.amount);
  }))

  loading = false;
}

async function updateInputAmounts() {
  loading = true;

  for (let i in inputs) {
    let input = inputs[i];

    if (!web3.utils.isAddress(input.address)) {
      input.amount = "0";
      input.usd = "0";
    } else {
      let contract = new web3.eth.Contract(erc20Abi, input.address);

      input.amount = await contract.methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();
      input.usd = "0"
      if (input.amount !== "0") {
        input.usd = await estimateUSDT(input.address, input.amount);

        let price = (await axios.get("https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?contract_addresses="+input.address+"&vs_currencies=usd")).data[input.address.toLowerCase()].usd;
        input.marketUSD = input.amount / 10** (await contract.methods.decimals().call()) * Number(price);
      }
    }
  }

  recalcInputPercentages();

  loading = false;
  instance?.proxy?.$forceUpdate();
}

function checkAddress(address) {
  return web3.utils.isAddress(address)
}

watch(outputs, async (before, after) => {
  if (loading.value) {
    return
  }

  await updateOutputAmounts()
})

watch(inputs, async (before, after) => {
  if (loading.value || JSON.stringify(before) === JSON.stringify(after)) {
    return
  }
  await updateInputAmounts()
})

watch(walletAddress, async (before, after) => {
  if (loading.value || JSON.stringify(before) === JSON.stringify(after)) {
    return
  }
  await updateInputAmounts()
})

const isOutputPercentageSumCorrect = computed(() => {
  let total = outputs.reduce((acc, output) => acc + Number(output.percentage), 0);
  return total === 100;
});

const totalUSDTmarket = computed(() => {
  return inputs.reduce((acc, input) => {
    if (input.marketUSD) {
      return input.marketUSD + acc
    }

    return acc
  }, 0);
});

const totalUSDT = computed(() => {
  return inputs.reduce((acc, input) => {
    if (input.usd) {
      return acc.add(web3.utils.toBN(input.usd))
    }

    return acc
  }, web3.utils.toBN(0));
});

let txs = reactive([]);

let batch = reactive({
  "version": "1.0",
  "chainId": "56",
  "createdAt": Math.floor(Date.now() / 1000),
  "meta": {
    "name": "Transactions Batch",
    "description": "",
    "txBuilderVersion": "1.11.1",
    "createdFromSafeAddress": "0xe514c6f3b8c7ec9d523669aab23da4883f3eae8f",
    "createdFromOwnerAddress": "",
    "checksum": "0x4e5c273a2ccff3cd40036b57b97cd08c41c5a90fb141e11151586fbfae0114d1"
  },
  "transactions": []
});

async function generateSellTx() {
  loading = true;

  batch.transactions = [];

  while(txs.length > 0) {
    txs.pop();
  }

  for (let i in inputs) {
    let input = inputs[i];

    if (!checkAddress(input.address)) {
      continue
    }

    if (input.amount === "0") {
      continue
    }

    if (input.address.toLowerCase() === USDT_ADDRESS) {
      continue
    }

    let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+USDT_ADDRESS+"&fromTokenAddress="+input.address+"&amount="+input.amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true");

    let tx = input.address;

    for (let j in res.data.protocols[0]) {
      let protocol = res.data.protocols[0][j][0];
      tx += " -> " + protocol.toTokenAddress;
    }

    let data = pancake.methods.swapExactTokensForTokens(
        res.data.fromTokenAmount,
        toBN(res.data.toTokenAmount).muln(98).divn(100),
        res.data.protocols[0].reduce((acc, protocol) => {
          if (protocol[0].toTokenAddress.toLowerCase() == ONEINCH_BASE_TOKEN) {
            acc.push(WBNB_ADDRESS);
            return acc
          }
          acc.push(protocol[0].toTokenAddress);
          return acc
        }, [input.address]),
        walletAddress.value,
        Math.floor(Date.now() / 1000) + 86400
    ).encodeABI();

    batch.transactions.push({
      "to": input.address,
      "value": "0",
      "data": (new web3.eth.Contract(erc20Abi, input.address)).methods.approve(PANCAKE_ADDRESS, res.data.fromTokenAmount).encodeABI(),
      "contractMethod": null,
      "contractInputsValues": null
    })

    batch.transactions.push({
      "to": PANCAKE_ADDRESS,
      "value": "0",
      "data": data,
      "contractMethod": null,
      "contractInputsValues": null
    })

    txs.push(tx + "\n" + data)
  }

  loading = false;
  instance?.proxy?.$forceUpdate();
  save()
}

async function generateBuyTx() {
  loading = true;

  while(txs.length > 0) {
    txs.pop();
  }

  let USDTBalance = await (new web3.eth.Contract(erc20Abi, USDT_ADDRESS)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();

  batch.transactions = [];

  for (let i in outputs) {
    let output = outputs[i];

    if (!checkAddress(output.address)) {
      continue
    }

    if (output.percentage === "0") {
      continue
    }

    if (output.address.toLowerCase() === USDT_ADDRESS) {
      continue
    }

    let amount = toBN(USDTBalance).muln(Number(output.percentage)).divn(totalOutPercentage.value);

    let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+output.address+"&fromTokenAddress="+USDT_ADDRESS+"&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true");

    let tx = USDT_ADDRESS;

    for (let j in res.data.protocols[0]) {
      let protocol = res.data.protocols[0][j][0];
      tx += " -> " + protocol.toTokenAddress;
    }

    let data = pancake.methods.swapExactTokensForTokens(
        res.data.fromTokenAmount,
        toBN(res.data.toTokenAmount).muln(98).divn(100),
        res.data.protocols[0].reduce((acc, protocol) => {
          if (protocol[0].toTokenAddress.toLowerCase() == ONEINCH_BASE_TOKEN) {
            acc.push(WBNB_ADDRESS);
            return acc
          }

          acc.push(protocol[0].toTokenAddress);
          return acc
        }, [USDT_ADDRESS]),
        walletAddress.value,
        Math.floor(Date.now() / 1000) + 86400
    ).encodeABI();

    batch.transactions.push({
      "to": PANCAKE_ADDRESS,
      "value": "0",
      "data": data,
      "contractMethod": null,
      "contractInputsValues": null
    })

    txs.push(tx + "\n" + data)
  }

  loading = false;
  instance?.proxy?.$forceUpdate();
  save();
}

async function copy(mytext) {
  try {
    await navigator.clipboard.writeText(mytext);
    alert('Copied');
  } catch($e) {
    alert('Cannot copy');
  }
}

function alert(m) {
  window.alert(m)
}

function fromWei(wei, decimals = 6) {
  return Number(Number(web3.utils.fromWei(wei, 'ether')).toFixed(decimals))
}

inputs.push(
    {address: "0x4B0F1812e5Df2A09796481Ff14017e6005508003"},
    {address: "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94"},
    {address: "0x76A797A59Ba2C17726896976B7B3747BfD1d220f"},
    {address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8"},
    {address: "0xf2Ba89A6f9670459ed5AeEfbd8Db52Be912228b8"}
)

outputs.push(
    {address: "0xf2ba89a6f9670459ed5aeefbd8db52be912228b8", percentage: "100"},
)

updateInputAmounts();

let saveData = (function () {
  let a = document.createElement("a");
  document.body.appendChild(a);
  a.style.display = "none";
  return function (data, fileName) {
    let json = JSON.stringify(data),
        blob = new Blob([json], {type: "octet/stream"}),
        url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  };
}());

function save() {
  saveData(batch, "batch.json");
}

const totalOutPercentage = computed(() => {
  return outputs.reduce((acc, output) => {
    if (output.slippage * 100 > 3) {
      return acc
    }
    return acc + Number(output.percentage)
  }, 0)
})
</script>

<template>
  <section class="section">
    <div class="container">

      <div class="field">
        <label class="label">Wallet address</label>
        <div class="control">
          <input class="input" :class="{'is-danger': !checkAddress(walletAddress)}" type="text" placeholder="0x" v-model="walletAddress">
        </div>
      </div>

      <div class="columns">
        <div class="column">
          <h1 class="title is-5">Inputs</h1>
          <div class="field has-addons" v-for="(input, i) in inputs">
            <p class="control is-expanded">
              <input :class="{'is-danger': !checkAddress(input.address)}" class="input" v-model="input.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
            </p>
            <p @click="alert(input.amount)" class="control">
              <div class="button is-static">{{ input.usd ? fromWei(input.usd, 2) : "..." }} USDT</div>
            </p>
            <p class="control">
              <a class="button is-static">{{ input.percentage ? (input.percentage*100).toFixed(1) : "..." }}%</a>
            </p>
          </div>

          <div class="notification">
            Total USDT (market): {{ totalUSDTmarket.toFixed(2) }} <br>
            Total USDT (estimate): {{ fromWei(totalUSDT) }}
          </div>

          <div class="buttons">
            <div class="button" @click="newInput">New asset</div>
            <button @click="generateSellTx" class="button is-primary" :class="{'is-loading': loading}" :disabled="loading">Generate SELL transactions</button>
          </div>

        </div>
        <div class="column">
          <h1 class="title is-5">Outputs</h1>

          <div class="field has-addons" v-for="(output, i) in outputs">
            <p class="control is-expanded">
              <input class="input" v-model="output.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
              <p class="help">Estimate: {{ output.amount.toFixed(5) }}, market: {{ output.marketAmount.toFixed(5) }}, slippage: {{ (output.slippage * 100).toFixed(2) }}</p>
            </p>
            <p class="control">
              <input class="input" v-model="output.percentage" type="text" placeholder="%">
            </p>
            <p class="control">
              <a class="button is-static">%</a>
            </p>
          </div>

          <div v-if="!isOutputPercentageSumCorrect" class="notification is-danger">
            Output is not summing up to 100%
          </div>

          <div class="buttons">
            <div class="button" @click="newOutput">New asset</div>
            <button @click="generateBuyTx" class="button is-primary" :class="{'is-loading': loading}" :disabled="!isOutputPercentageSumCorrect || loading">Generate BUY transactions</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>