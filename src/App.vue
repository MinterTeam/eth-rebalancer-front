<script setup>
import {computed, reactive, ref, watch} from "vue";

let walletAddress = ref("0xE514c6F3b8C7EC9d523669aAb23Da4883f3eae8F");

let inputs = reactive([]);
function newInput() {
  inputs.push({})
}
newInput()

let outputs = reactive([]);
function newOutput() {
  outputs.push({})
}
newOutput()

function recalcInputPercentages() {
  let total = inputs.reduce((acc, input) => acc + input.amount, 0);
  inputs.forEach(input => input.percentage = input.amount / total);
}

function updateInputAmounts() {
  inputs.forEach(input => input.amount = 1);
}

watch(inputs, async (before, after) => {
  for (let i in after) {
    let input = after[i];
    if (input.percentage == null && input.address && input.address.startsWith("0x")) {
      console.log(input.address)
      updateInputAmounts()
      recalcInputPercentages()
      break
    }
  }
})

const isOutputPercentageSumCorrect = computed(() => {
  let total = outputs.reduce((acc, output) => acc + Number(output.percentage), 0);
  return total === 100;
});

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
              <a class="button is-static">{{ input.amount ?? "..." }}</a>
            </p>
            <p class="control">
              <a class="button is-static">{{ input.percentage ? input.percentage * 100 : "..." }}%</a>
            </p>
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
      <div class="button is-primary" :disabled="!isOutputPercentageSumCorrect">Generate transactions</div>
    </div>
  </section>
</template>