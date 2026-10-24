<script lang="ts">
  import { debounce, Editor, parseYaml } from "obsidian";
  import type Renderer from "../chartRenderer";
  import { createEventDispatcher } from "svelte";
  import CollapsibleSection from './CollapsibleSection.svelte';
  import { renderError } from "src/util";
  import type { DataField } from "src/constants/settingsConstants";

  export let editor: Editor;
  export let renderer: Renderer;
  export let onclose: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  let chartType: string = "bar";
  let lastChart: HTMLElement | SVGElement | null = null;
  let tension: number = 20;
  let width: number = 80;
  let fill: boolean = false;
  let labelColors: boolean = false;
  let startAtZero: boolean = false;
  let bestFit: boolean = false;
  let bestFitTitle: string;
  let bestFitNumber: string = "0";
  let labels: string = "";
  let data: DataField[] = [{ dataTitle: "", data: "" }];
  let chart: string;
  let previewElement: HTMLDivElement | null = null;

  const debouncedRenderChart = debounce(
    async (yaml: any, el: HTMLElement) => {
      if (previewElement) previewElement.empty();
      try {
        const prepared = await renderer.datasetPrep(parseYaml(yaml), el);
        lastChart = await renderer.renderRaw(prepared, el);
      } catch (error) {
        renderError(error, el);
      }
    },
    500,
    true
  );

  $: chart = `type: ${chartType}
labels: [${labels}]
series:
${data
  .map((data) => `  - title: ${data.dataTitle}\n    data: [${data.data}]`)
  .join("\n")}
tension: ${tension / 100}
width: ${width}%
labelColors: ${labelColors}
fill: ${fill}
beginAtZero: ${startAtZero}
bestFit: ${bestFit}
bestFitTitle: ${bestFitTitle}
bestFitNumber: ${bestFitNumber}`;

  $: {
    if (previewElement) {
      debouncedRenderChart(chart, previewElement);
    }
  }

  function insertChart() {
    let doc = editor.getDoc();
    let cursor = doc.getCursor();
    if (previewElement) previewElement.empty();

    doc.replaceRange("```chart\n" + chart + "\n```", cursor);
    dispatch("close");
    if (onclose) onclose();
  }
</script>

<div class="chart-modal">
  <h3>Create a new Chart</h3>
  <div class="modalColumn">
    <div>
      <table style="width:100%">
        <tbody>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Chart Type</p>
              <p class="subDesc">Choose a Chart Type</p></td
            ><td class="controlElement"
              ><select
                name="Chart Types"
                id="chart-types"
                class="dropdown"
                bind:value={chartType}
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="doughnut">Doughnut</option>
                <option value="radar">Radar</option>
                <option value="polarArea">Polar Area</option>
                <option value="sankey">Sankey</option>
              </select></td
            >
          </tr>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Smoothness</p>
              <p class="subDesc">Changes the smoothness of the Chart</p></td
            ><td class="controlElement"
              ><input
                type="range"
                min="0"
                max="100"
                class="slider"
                bind:value={tension}
              /></td
            >
          </tr>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Width</p>
              <p class="subDesc">Changes the horizontal width</p></td
            ><td class="controlElement"
              ><input
                type="range"
                min="20"
                max="100"
                class="slider"
                bind:value={width}
              /></td
            >
          </tr>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Fill</p>
              <p class="subDesc">Fill the underside of the Chart</p></td
            ><td class="controlElement"
              ><input
                type="checkbox"
                class="task-list-item-checkbox"
                style="width: 16px; height: 16px"
                bind:checked={fill}
              /></td
            >
          </tr>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Distinct Colors</p>
              <p class="subDesc">Use distinct Colors for each Label</p></td
            ><td class="controlElement"
              ><input
                type="checkbox"
                class="task-list-item-checkbox"
                style="width: 16px; height: 16px"
                bind:checked={labelColors}
              /></td
            >
          </tr>
          <tr>
            <td class="desc"
              ><p class="mainDesc">Start at Zero</p>
              <p class="subDesc">Don't cut the graph at the bottom</p></td
            ><td class="controlElement"
              ><input
                type="checkbox"
                class="task-list-item-checkbox"
                style="width: 16px; height: 16px"
                bind:checked={startAtZero}
              /></td
            >
          </tr>
        </tbody>
      </table>
      <hr />
      <table style="width:100%">
        <tbody>
          <tr>
            <td class="desc"
              ><p class="mainDesc">X Axis</p>
              <p class="subDesc">Set Labels (Comma seperated)</p></td
            >
            <td class="controlElement">
              <input
                type="text"
                placeholder="Monday, Tuesday, ..."
                bind:value={labels}
              /><br />
            </td>
          </tr>
        </tbody>
      </table>
      <hr />
      <table style="width:100%">
        <tbody>
          {#each data as d, i}
            <tr>
              <td class="desc"
                ><p class="mainDesc">Y Axis</p>
                <p class="subDesc">Set Data Fields (Comma seperated)</p></td
              >
              <td class="controlElement">
                <input type="text" placeholder="Name" bind:value={d.dataTitle} />
                <br />
                <input
                  type="text"
                  placeholder="1, -2, 11, 5"
                  style="margin-top: 3px;"
                  bind:value={d.data}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="addMoreButtonContainer">
        <button
          on:click={() => (data = [...data, { data: "", dataTitle: "" }])}
          >Add more</button
        >
      </div>
      <hr />
      <CollapsibleSection headerText={'Line of Best Fit (Line chart only)'} >
        <hr>
      <table style="width:100%">
        <tbody>
          <tr>
            <td class="desc"
            ><p class="mainDesc">Line of Best Fit</p>
              <p class="subDesc">Create a line of best fit</p></td
            ><td class="controlElement"
          ><input
                  type="checkbox"
                  class="task-list-item-checkbox"
                  style="width: 16px; height: 16px"
                  bind:checked={bestFit}
          /></td>
          </tr>
          <tr>
            <td class="desc"
            ><p class="mainDesc">Best Fit Line ID</p>
              <p class="subDesc">The line ID used to create the line of best fit</p></td
            ><td class="controlElement"
          ><input
                  type="text"
                  placeholder="0"
                  style="width: 26px; height: 32px"
                  bind:value={bestFitNumber}
          /><br /></td>
          </tr>
          <tr>
            <td class="desc"
            ><p class="mainDesc">Line of Best Fit Title</p>
              <p class="subDesc">The title for the line of best fit</p></td
            ><td class="controlElement">
            <input
                    type="text"
                    placeholder="Line of Best Fit"
                    style="width: 96px; height: 32px"
                    bind:value={bestFitTitle}
            /><br /></td>
          </tr>
        </tbody>
      </table>
        </CollapsibleSection>
    </div>
    <div class="chartPreview">
      <div id="preview" bind:this={previewElement}></div>
    </div>
  </div>
  <hr />
</div>
<div style="display: flex; justify-content: center; align-items: center;">
  <button class="mod-cta" on:click={insertChart}>Insert Chart</button>
</div>

<style>
  .addMoreButtonContainer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.4rem;
  }

  .subDesc {
    font-size: smaller;
    opacity: 0.5;
    margin: 0;
  }
  .desc {
    padding-right: 1em;
  }
  .mainDesc {
    margin: 0;
  }
  table {
    margin: auto;
  }
  .controlElement {
    text-align: center;
  }
  .chart-modal {
    overflow-y: auto;
    max-width: 100%;
  }
  .modalColumn {
    display: flex;
    gap: 2em;
  }
  .chartPreview {
    width: 30vw;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 600px) {
    .modalColumn {
      flex-direction: column;
      gap: 1em;
    }
    .chartPreview {
      width: 100%;
      min-height: 200px;
    }
  }
</style>
