import { Ableton } from "ableton-js";
import { Namespace } from "ableton-js/ns";
import { Device } from "ableton-js/ns/device";
import { Track } from "ableton-js/ns/track";
import util from "util";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

const run = async () => {
  // Establishes a connection with Live
  await ableton.start();

  // Observe the current playback state and tempo
  ableton.song.addListener("is_playing", (p) => console.log("Playing:", p));
  ableton.song.addListener("tempo", (t) => console.log("Tempo:", t));
  // const tracks = await ableton.song.get("tracks");

  // const trackNames = await Promise.all(
  //   tracks.map(async (track) => {
  //     return await track.get("name");
  //   })
  // );

  await dumpSimplers();
};

run();

// class ObjectObserver<GP, TP, SP, OP> {
//   constructor(private obj: Namespace<GP, TP, SP, OP>) {}

//   observe<T extends keyof OP>(prop: T) {
//     this.obj.addListener(prop, (data) => {

//     });
//     //
//   }
// }

async function observeProperty<GP, TP, SP, OP, T extends keyof OP>(
  obj: Namespace<GP, TP, SP, OP>,
  prop: keyof OP & keyof GP,
  onValue: (value: T extends keyof TP ? TP[T] : OP[T]) => void
) {
  let value = await obj.get(prop);

  let ref: {
    value: T extends keyof TP ? TP[T] : OP[T];
  } = {
    // OP will be a subset of GP
    value: value as T extends keyof TP ? TP[T] : OP[T],
  };
  obj.addListener(prop, (data) => {
    ref.value = data as T extends keyof TP ? TP[T] : OP[T];

    onValue(ref.value);
  });

  onValue(ref.value);
}

function getItemIDs(items: any[]): string[] {
  return items.map((item) => {
    // assert item has id
    if (
      !isObject(item) ||
      !isObject(item.raw) ||
      typeof item.raw.id !== "string"
    ) {
      throw new Error("Expected an object with an id");
    }

    return item.raw.id;
  });
}

// observe a property that is a collection of items, and maintain
// observers for each item in the collection
async function observeCollection<GP, TP, SP, OP, T extends keyof OP>(
  obj: Namespace<GP, TP, SP, OP>,
  prop: keyof OP & keyof GP,
  onValue: (value: T extends keyof TP ? TP[T] : OP[T]) => void
) {
  const initialItems = await obj.get(prop);
  if (!Array.isArray(initialItems)) {
    throw new Error("Expected an array");
  }

  let itemIDs = new Set(getItemIDs(initialItems as any[]));

  obj.addListener(prop, (data) => {
    if (!Array.isArray(data)) {
      throw new Error("Expected an array");
    }

    const items = data as any[];
    const newItemIDs = new Set(getItemIDs(items));

    // stop observing items that are no longer in the collection
    itemIDs.forEach((id) => {
      if (!newItemIDs.has(id)) {
        // itemIDs.delete(id);
      }
    });

    // start observing new items
    items.forEach((item) => {
      if (!itemIDs.has(item.raw.id)) {
        // itemIDs.add(item.raw.id);
      }
    });

    itemIDs = newItemIDs;
  });
}

function isObject(value: any) {
  return value && typeof value === "object";
}

async function dumpSimplers() {
  const tracks = await ableton.song.get("tracks");

  const activeTracks = (
    await Promise.all(
      tracks.map(async (track) => {
        const isMuted = await track.get("mute");
        if (isMuted) {
          return null;
        }
        return track;
      })
    )
  ).filter((track) => track !== null) as Track[];

  const tracksSimplers = await Promise.all(
    activeTracks.map(async (track) => {
      const devices = await track.get("devices");
      // const devices = devices.filter(
      //   (device) => device.raw.class_name === "OriginalSimpler"
      // );
      const devicesProperties = await Promise.all(
        devices.map(async (simpler) => {
          return getProperties(simpler, [
            "class_display_name",
            "parameters",
            "type",
          ]);
        })
      );
      console.log("---- ", track.raw.name);
      // console.log(devicesProperties[0]?.parameters?.map((p) => p.raw));

      if (devices[0]?.raw.class_name == "OriginalSimpler") {
        const simplerParams = await getSimplerParams(devices[0]);
        // console.log(simplerParams);
      } else {
        console.log(devices.map((d) => d.raw.class_name));
        if (devices[0]?.raw.class_name === "DrumGroupDevice") {
          console.log(devices[0].raw);
          const subdevices = await devices[0]?.get("devices");
        }

        // const params = await devices[0]?.get("parameters");
        // let paramsValues = null;
        // if (params) {
        //   paramsValues = Object.fromEntries(
        //     await Promise.all(
        //       params.map(async (param) => {
        //         return [param.raw.name, await param.get("value")];
        //       })
        //     )
        //   );
        // }
        // console.log(devices[0]?.raw.class_name, paramsValues);
      }

      return [track.raw.name, devicesProperties];
    })
  );
}

console.log("hello", new Date().toLocaleTimeString());

async function getSimplerParams(simpler: Device) {
  const params = await simpler.get("parameters");

  const paramValues = await Promise.all(
    params.map(async (param) => {
      return [param.raw.name, await param.get("value")];
    })
  );

  return Object.fromEntries(paramValues);
}

async function getProperties(
  obj: Namespace<any, any, any, any>,
  properties: string[]
): Promise<Object> {
  const result = {};
  const entries = await Promise.all(
    properties.map(async (prop) => {
      return [prop, await obj.get(prop)];
    })
  );

  return Object.fromEntries(entries);
}
