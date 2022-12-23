<script setup>
import {computed, onMounted, reactive, ref, watch} from "vue";
import Web3 from 'web3';
import erc20Abi from "@/erc20.abi";
import rebalancerAbi from "@/rebalancer.abi";
import axios from "axios";
import { getCurrentInstance } from 'vue'
const instance = getCurrentInstance();

const REBALANCER_ADDRESS = "0xc78Af8c0CFcC2489E70353f5c2f1863d9787B9BD";
const USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const slippage = "0.5";
const ONEINCH_BASE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const rpcURL = 'https://bsc-dataseed1.binance.org/'
const web3 = new Web3(rpcURL)

let walletAddress = ref("0xE514c6F3b8C7EC9d523669aAb23Da4883f3eae8F");
let loading = ref(false);
let calculated = ref(false);

let rebalancer = await new web3.eth.Contract(rebalancerAbi, REBALANCER_ADDRESS);

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

  inputs.forEach(input => input.percentage = (fromWei(input.usd) / total).toFixed(4));
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

async function update() {
  loading = true;
  await updateInputAmounts();
  await updateOutputAmounts();
  loading = false;
  calculated = true;
  instance?.proxy?.$forceUpdate();
}

watch(inputs, () => {
  calculated = false;
})

watch(outputs, () => {
  calculated = false;
})

watch(walletAddress, () => {
  calculated = false;
})

async function updateOutputAmounts() {
  let USDTBalance = totalUSDT.value;

  let price = (await axios.get("https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?contract_addresses="+outputs.reduce((acc, i) => {
    if (web3.utils.isAddress(i.address)) {
      acc.push(i.address)
      return acc
    }

    return acc
  }, []).join(",")+"&vs_currencies=usd"));

  await Promise.all(outputs.map(async (output) => {
    if (!web3.utils.isAddress(output.address)) {
      output.usd = null;
      output.marketAmount = null;
      output.amount = null;
      output.symbol = null;
      output.slippage = null;
      output.usdAmount = null;
      return
    }

    let contract = new web3.eth.Contract(erc20Abi, output.address);
    let decimals = await contract.methods.decimals().call();

    let usdAmount = toBN(USDTBalance).muln(Number(output.percentage * 100)).divn(100 * 100);

    output.marketAmount = Number(web3.utils.fromWei(usdAmount)) / Number(price.data[output.address.toLowerCase()].usd);
    output.amount = (await estimateAmount(output.address, usdAmount)) / 10 ** decimals;
    output.symbol = await contract.methods.symbol().call();
    output.slippage = (output.marketAmount - output.amount) / output.marketAmount;
    output.usdAmount = Number(web3.utils.fromWei(usdAmount));
  }))

  outputs.sort((a, b) => b.percentage - a.percentage);
}

async function updateInputAmounts() {
  let price = (await axios.get("https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain?contract_addresses="+inputs.reduce((acc, i) => {
    if (web3.utils.isAddress(i.address)) {
      acc.push(i.address)
      return acc
    }

    return acc
  }, []).join(",")+"&vs_currencies=usd"));

  await Promise.all(inputs.map(async (input) => {
    if (!web3.utils.isAddress(input.address)) {
      input.amount = "0";
      input.usd = "0";
    } else {
      let contract = new web3.eth.Contract(erc20Abi, input.address);

      input.amount = await contract.methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();
      input.symbol = await contract.methods.symbol().call();
      input.decimals = await contract.methods.decimals().call();
      input.usd = "0"
      if (input.amount !== "0") {
        input.usd = await estimateUSDT(input.address, input.amount);
        input.marketUSD = input.amount / 10** (await contract.methods.decimals().call()) * Number(price.data[input.address.toLowerCase()].usd);
      }
    }
  }));

  recalcInputPercentages();
}

function checkAddress(address) {
  return web3.utils.isAddress(address)
}

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

let USDTBalance = await (new web3.eth.Contract(erc20Abi, USDT_ADDRESS)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();

async function generateTx() {
  loading = true;
  instance?.proxy?.$forceUpdate();

  batch.transactions = [];

  let sellPaths = [];
  let sellMinAmounts = [];
  let buyPaths = [];
  let buyShares = [];
  let buyMaxPrices = [];
  let buyMaxPriceDenom = "1" + "0".repeat(10);

  for (let i in inputs) {
    let input = inputs[i];

    if (!checkAddress(input.address) || input.amount === "0") {
      continue
    }

    if (input.address.toLowerCase() === USDT_ADDRESS) {
      batch.transactions.push({
        "to": input.address,
        "value": "0",
        "data": (new web3.eth.Contract(erc20Abi, input.address)).methods.approve(REBALANCER_ADDRESS, input.amount).encodeABI(),
        "contractMethod": null,
        "contractInputsValues": null
      })

      sellPaths.push([USDT_ADDRESS]);
      sellMinAmounts.push(0);
      continue
    }

    let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+USDT_ADDRESS+"&fromTokenAddress="+input.address+"&amount="+input.amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true");

    batch.transactions.push({
      "to": input.address,
      "value": "0",
      "data": (new web3.eth.Contract(erc20Abi, input.address)).methods.approve(REBALANCER_ADDRESS, res.data.fromTokenAmount).encodeABI(),
      "contractMethod": null,
      "contractInputsValues": null
    })

    sellPaths.push(res.data.protocols[0].reduce((acc, protocol) => {
      if (protocol[0].toTokenAddress.toLowerCase() == ONEINCH_BASE_TOKEN) {
        acc.push(WBNB_ADDRESS);
        return acc
      }
      acc.push(protocol[0].toTokenAddress);
      return acc
    }, [input.address]));

    sellMinAmounts.push(toBN(res.data.toTokenAmount).muln(98).divn(100));
  }

  USDTBalance = sellMinAmounts.reduce((acc, i) => { return acc.add(toBN(i)) }, toBN(0)).add(toBN(await (new web3.eth.Contract(erc20Abi, USDT_ADDRESS)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call())).toString();

  for (let i in outputs) {
    let output = outputs[i];

    if (!checkAddress(output.address)) {
      continue
    }

    if (output.percentage === "0") {
      continue
    }

    if (output.address.toLowerCase() === USDT_ADDRESS) {
      buyPaths.push([USDT_ADDRESS]);
      buyShares.push(0);
      buyMaxPrices.push(0);
      continue
    }

    let amount = toBN(USDTBalance).muln(Number(output.percentage * 100)).divn(totalOutPercentage.value * 100);
    let res = await axios.get("https://api.1inch.io/v5.0/56/swap?protocols=PANCAKESWAP_V2&toTokenAddress="+output.address+"&fromTokenAddress="+USDT_ADDRESS+"&amount="+amount+"&fromAddress="+walletAddress.value+"&slippage="+slippage+"&disableEstimate=true");

    buyPaths.push(res.data.protocols[0].reduce((acc, protocol) => {
      if (protocol[0].toTokenAddress.toLowerCase() == ONEINCH_BASE_TOKEN) {
        acc.push(WBNB_ADDRESS);
        return acc
      }

      acc.push(protocol[0].toTokenAddress);
      return acc
    }, [USDT_ADDRESS]))

    buyShares.push(toBN("10000").muln(Number(output.percentage * 100)).divn(totalOutPercentage.value * 100));
    buyMaxPrices.push(toBN(res.data.fromTokenAmount).mul(toBN(buyMaxPriceDenom)).div(toBN(res.data.toTokenAmount)).muln(98).divn(100));
  }

  batch.transactions.push({
    "to": REBALANCER_ADDRESS,
    "value": "0",
    "data": rebalancer.methods.call(
        USDT_ADDRESS,
        sellPaths,
        sellMinAmounts,
        buyPaths,
        buyMaxPrices,
        buyMaxPriceDenom,
        buyShares,
        nonce
    ).encodeABI()
  })

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

function fromWei(wei, fixed = 6, decimals = 18) {
  if (decimals != 18) {
    return (wei / 10 ** decimals).toFixed(fixed)
  }
  return Number(Number(web3.utils.fromWei(wei, 'ether')).toFixed(fixed))
}

let lastNonce = await rebalancer.methods.nonces(walletAddress.value).call();
if (lastNonce == 0) { // todo: remove this condition
  lastNonce = 2217;
}
let previous = await axios.get("https://recalibration-api.honee.app/v1/portfolio/" + lastNonce);
for (let address in previous.data.data.list) {
  inputs.push(
      {address: address},
  )
}

let res = await axios.get("https://recalibration-api.honee.app/v1/portfolio/last")
let nonce = res.data.data.id;
for (let address in res.data.data.list) {
  let percentage = res.data.data.list[address];

  outputs.push(
      {address: address, percentage: String(percentage)},
  )
}

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

function deleteInput(input) {
  inputs.splice(inputs.indexOf(input), 1)
}

function deleteOutput(output) {
  outputs.splice(outputs.indexOf(output), 1)
}

onMounted(() => {
  update();
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
          <h1 class="title is-5">Inputs (ID: {{ lastNonce }})</h1>
          <div v-for="(input, i) in inputs" class="mb-2">
            <div class="field has-addons mb-0">
              <div v-if="input.symbol" class="control">
               <div class="button is-static">{{ input.symbol }}</div>
              </div>
              <p class="control is-expanded">
                <input :class="{'is-danger': !checkAddress(input.address)}" class="input" v-model="input.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
              </p>
              <p class="control">
                <a class="button is-static">{{ input.percentage ? (input.percentage*100).toFixed(1) : "..." }}%</a>
              </p>
              <p class="control">
                <a @click="deleteInput(input)" class="button is-static">
                  <button class="delete is-small"></button>
                </a>
              </p>
            </div>
            <p class="help mb-2" v-if="input.usd">${{fromWei(input.usd, 2)}}, amount: {{ fromWei(input.amount, 18, input.decimals) }}</p>
          </div>

          <div class="buttons">
            <div class="button" @click="newInput">New asset</div>
          </div>

          <div class="notification">
            Total USDT (market): {{ totalUSDTmarket.toFixed(2) }} <br>
            Total USDT (estimate): {{ fromWei(totalUSDT) }}
          </div>
        </div>
        <div class="column">
          <h1 class="title is-5">Outputs (ID: {{nonce}})</h1>

          <div v-for="(output, i) in outputs" class="mb-2">
            <div class="field has-addons mb-0">
              <div v-if="output.symbol" class="control">
                <div class="button is-static">{{ output.symbol }}</div>
              </div>
              <p class="control is-expanded">
                <input class="input" v-model="output.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
              </p>
              <p style="width: 50px" class="control">
                <input class="input" v-model="output.percentage" type="text" placeholder="%">
              </p>
              <p class="control">
                <a class="button is-static">%</a>
              </p>
              <p class="control">
                <a @click="deleteOutput(output)" class="button is-static">
                  <button class="delete is-small"></button>
                </a>
              </p>
            </div>
            <p class="help" v-if="output.amount && output.marketAmount && output.slippage">${{output.usdAmount.toFixed(2)}}, est: {{ output.amount.toFixed(5) }} ({{ output.marketAmount.toFixed(5) }}), pi: {{ (output.slippage * 100).toFixed(2) }}%</p>
          </div>

          <div v-if="!isOutputPercentageSumCorrect" class="notification is-danger">
            Output is not summing up to 100%
          </div>

          <div class="buttons">
            <div class="button" @click="newOutput">New asset</div>
          </div>
        </div>
      </div>

      <div class="buttons">
        <button class="button is-primary" :class="{'is-loading': loading}" @click="update" v-if="!calculated">Recalculate</button>
        <button @click="generateTx" class="button is-primary" :class="{'is-loading': loading}" :disabled="loading || !calculated">Generate transactions batch</button>
      </div>
    </div>
  </section>
</template>