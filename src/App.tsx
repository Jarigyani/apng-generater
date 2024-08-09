import { For, Show, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { convertToAPNG, fetchImage } from "./lib/convertToAPNG";

let fileInputRef: HTMLInputElement;

function App() {
  const [data, setData] = createStore({
    url: "",
    binary: new Uint8Array(),
    processingTime: "",
  });
  const [files, setFiles] = createSignal<Uint8Array[]>([]);
  const [delay, setDelay] = createSignal(100);

  const handleClick = async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `/run${i + 1}.png`);
    const images = await Promise.all(paths.map(fetchImage));
    setFiles(images);
    fileInputRef.value = "";
  };

  const handleInput = async (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;

    const images = Array.from(files).map((file) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      return new Promise<Uint8Array>((resolve) => {
        reader.onload = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
      });
    });

    setFiles(await Promise.all(images));
  };

  const handleDownload = () => {
    if (data.url) {
      const link = document.createElement("a");
      link.href = data.url;
      link.download = "output.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(data.url);
    }
  };

  createEffect(async () => {
    delay();
    if (files().length > 0) {
      const res = await convertToAPNG(await Promise.all(files()), delay());
      if (res?.url) setData(res);
    }
  });

  return (
    <div
      data-theme="light"
      class="flex flex-col h-screen justify-center items-center gap-5"
    >
      <button type="button" onClick={handleClick} class="btn btn-outline">
        sample images
      </button>
      <div class="w-64 h-64 flex justify-center items-center">
        <Show fallback={<p>no images</p>} when={data.url}>
          {(url) => (
            <img
              src={url()}
              alt="APNG"
              class="object-cover w-full disable-blur"
            />
          )}
        </Show>
      </div>
      <div class="max-w-lg overflow-scroll">
        <div class="flex w-max">
          <For each={files()}>
            {(file, i) => (
              <div class="flex flex-col gap-2 items-center">
                <img
                  src={URL.createObjectURL(
                    new Blob([file], { type: "image/png" })
                  )}
                  alt=""
                  class="object-cover disable-blur border border-neutral w-12"
                />
                <p class="badge">{i() + 1}</p>
              </div>
            )}
          </For>
        </div>
      </div>
      <Show when={data.url}>
        <p>
          Processed in <span class="font-bold">{data.processingTime}</span> ms
        </p>
      </Show>
      <div class="flex gap-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          multiple
          oninput={handleInput}
          class="file-input file-input-bordered w-full max-w-xs"
        />
        <button
          type="button"
          onClick={handleDownload}
          class="btn btn-outline"
          disabled={!data.url}
        >
          download
        </button>
      </div>
      <div class="w-96">
        <input
          type="range"
          min={11}
          max={500}
          value={delay()}
          class="range"
          step={1}
          oninput={(e) => setDelay(+e.currentTarget.value)}
        />
      </div>
      <p class="text-xl">
        frame delay: <span class="font-bold">{delay()}</span> ms
      </p>
    </div>
  );
}

export default App;
