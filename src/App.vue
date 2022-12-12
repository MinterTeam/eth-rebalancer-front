<script setup>
import {computed, reactive, ref, watch} from "vue";
import Web3 from 'web3';
import erc20Abi from "@/erc20.abi";

const rpcURL = 'https://bsc.getblock.io/a215c97d-a4d7-41b9-b94d-da3b1ac94c18/mainnet/'
const web3 = new Web3(rpcURL)

let walletAddress = ref("0xE514c6F3b8C7EC9d523669aAb23Da4883f3eae8F");
let loading = ref(false);
let totalUSDT = ref("100.1");

let inputs = reactive([{}]);
function newInput() {
  inputs.push({})
}

let outputs = reactive([{percentage: "100"}]);
function newOutput() {
  outputs.push({})
}

function recalcInputPercentages() {
  let total = inputs.reduce((acc, input) => acc + input.usd, 0);
  inputs.forEach(input => input.percentage = Math.round((input.usd / total) * 100)/100);
}

async function updateInputAmounts() {
  loading = true;

  for (let i in inputs) {
    let input = inputs[i];
    input.amount = await (new web3.eth.Contract(erc20Abi, input.address)).methods.balanceOf(web3.utils.toChecksumAddress(walletAddress.value)).call();
    input.usd = input.amount; // todo: estimate
  }

  recalcInputPercentages();

  loading = false;
}

watch(inputs, async (before, after) => {
  for (let i in after) {
    let input = after[i];
    if (input.percentage == null && input.address && input.address.startsWith("0x")) {
      updateInputAmounts()
      break
    }
  }
})

watch(walletAddress, async (before, after) => {
  updateInputAmounts()
})

const isOutputPercentageSumCorrect = computed(() => {
  let total = outputs.reduce((acc, output) => acc + Number(output.percentage), 0);
  return total === 100;
});

function generateTx() {
  loading.value = true;
  console.log(inputs, outputs)
}

function fromWei(wei, decimals = 4) {
  return Math.round(web3.utils.fromWei(wei, 'ether') * 10**decimals) / 10**decimals;
}

</script>

<template>
  <section class="section">
    <div class="container">

      <div class="field">
        <label class="label">Wallet address</label>
        <div class="control">
          <input class="input" type="text" placeholder="0x" v-model="walletAddress">
        </div>
      </div>

      <div class="columns">
        <div class="column">
          <h1 class="title is-5">Inputs</h1>
          <div class="field has-addons" v-for="(input, i) in inputs">
            <p class="control is-expanded">
              <input class="input" v-model="input.address" type="text" :placeholder="'Asset '+(i+1)+' (0x...)'">
            </p>
            <p class="control">
              <a class="button is-static">{{ input.amount ? fromWei(input.amount) : "..." }}</a>
            </p>
            <p class="control">
              <a class="button is-static">{{ input.percentage ? input.percentage * 100 : "..." }}%</a>
            </p>
          </div>

          <div class="notification">
            Total USDT: {{ totalUSDT }}
          </div>

          <div class="button" @click="newInput">New input asset</div>
        </div>
        <div class="column">
          <h1 class="title is-5">Outputs</h1>
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

          <div class="button" @click="newOutput">New output asset</div>
        </div>
      </div>
      <div v-if="!isOutputPercentageSumCorrect" class="notification is-danger">
        Output is not summing up to 100%
      </div>
      <button @click="generateTx" class="button is-primary" :class="{'is-loading': loading}" :disabled="!isOutputPercentageSumCorrect || loading">Generate transactions</button>
    </div>
  </section>
</template>