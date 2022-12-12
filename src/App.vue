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

const rpcURL = 'https://bsc.getblock.io/a215c97d-a4d7-41b9-b94d-da3b1ac94c18/mainnet/'
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

async function estimateUSDT(address, amount) {
  if (address.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
    return amount
  }

  let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress=0x55d398326f99059ff775485246999027b3197955&fromTokenAddress="+address+"&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true")

  return res.data.toTokenAmount
}

async function updateInputAmounts() {
  loading = true;

  for (let i in inputs) {
    let input = inputs[i];

    if (!web3.utils.isAddress(input.address)) {
      input.amount = "0";
      input.usd = "0";
    } else {
      input.amount = await (new web3.eth.Contract(erc20Abi, input.address)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();
      input.usd = await estimateUSDT(input.address, input.amount);
    }
  }

  recalcInputPercentages();

  loading = false;
  instance?.proxy?.$forceUpdate();
}

function checkAddress(address) {
  return web3.utils.isAddress(address)
}

watch(inputs, async (before, after) => {
  await updateInputAmounts()
})

watch(walletAddress, async (before, after) => {
  await updateInputAmounts()
})

const isOutputPercentageSumCorrect = computed(() => {
  let total = outputs.reduce((acc, output) => acc + Number(output.percentage), 0);
  return total === 100;
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

async function generateTx() {
  loading = true;

  while(txs.length > 0) {
    txs.pop();
  }

  for (let i in inputs) {
    let input = inputs[i];

    if (!checkAddress(input.address)) {
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
        toBN(res.data.toTokenAmount).muln(95).divn(100),
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

  for (let i in outputs) {
    let output = outputs[i];

    if (!checkAddress(output.address)) {
      continue
    }

    if (output.address.toLowerCase() === USDT_ADDRESS) {
      continue
    }

    let amount = toBN(totalUSDT.value).muln(99).divn(100).muln(Number(output.percentage)).divn(100);

    let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+output.address+"&fromTokenAddress="+USDT_ADDRESS+"&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true");

    let tx = USDT_ADDRESS;

    for (let j in res.data.protocols[0]) {
      let protocol = res.data.protocols[0][j][0];
      tx += " -> " + protocol.toTokenAddress;
    }

    let data = pancake.methods.swapExactTokensForTokens(
        res.data.fromTokenAmount,
        toBN(res.data.toTokenAmount).muln(95).divn(100),
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
}

async function copy(mytext) {
  try {
    await navigator.clipboard.writeText(mytext);
    alert('Copied');
  } catch($e) {
    alert('Cannot copy');
  }
}

function fromWei(wei, decimals = 6) {
  return Number(Number(web3.utils.fromWei(wei, 'ether')).toFixed(decimals))
}

inputs.push(
    {address: "0x4b0f1812e5df2a09796481ff14017e6005508003"},
    {address: "0x55d398326f99059ff775485246999027b3197955"},
    {address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8"},
    {address: "0x76A797A59Ba2C17726896976B7B3747BfD1d220f"},
    {address: "0xf2ba89a6f9670459ed5aeefbd8db52be912228b8"},
    {address: "0x156ab3346823b651294766e23e6cf87254d68962"}
)

outputs.push(
    {address: "0xf2ba89a6f9670459ed5aeefbd8db52be912228b8", percentage: "100"},
)

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
          <div class="button mb-5" @click="newInput">New input asset</div>
          <div class="field has-addons" v-for="(input, i) in inputs">
            <p class="control is-expanded">
              <input :class="{'is-danger': !checkAddress(input.address)}" class="input" v-model="input.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
            </p>
            <p class="control">
              <a class="button is-static">{{ input.usd ? fromWei(input.usd, 2) : "..." }} USDT</a>
            </p>
            <p class="control">
              <a class="button is-static">{{ input.percentage ? (input.percentage*100).toFixed(1) : "..." }}%</a>
            </p>
          </div>

          <div class="notification">
            Total USDT: {{ fromWei(totalUSDT) }}
          </div>
        </div>
        <div class="column">
          <h1 class="title is-5">Outputs</h1>
          <div class="button mb-5" @click="newOutput">New output asset</div>

          <div class="field has-addons" v-for="(output, i) in outputs">
            <p class="control is-expanded">
              <input class="input" v-model="output.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
            </p>
            <p class="control">
              <input class="input" v-model="output.percentage" type="text" placeholder="%">
            </p>
            <p class="control">
              <a class="button is-static">%</a>
            </p>
          </div>
        </div>
      </div>
      <div v-if="!isOutputPercentageSumCorrect" class="notification is-danger">
        Output is not summing up to 100%
      </div>
      <button @click="generateTx" class="button is-primary" :class="{'is-loading': loading}" :disabled="!isOutputPercentageSumCorrect || loading">Generate transactions</button>
      <div class="block pt-5">
        <div v-if="!loading">
          <button class="button" @click="save">Save to batch.json</button>
          <br>
          <br>
          <pre>{{ JSON.stringify(batch, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>