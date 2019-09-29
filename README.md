## node-red-contrib-knx

KNXnet/IP support for Node-Red. Provides nodes to talk to KNX both in raw form and as higher level devices.

Uses the KNXnet/IP library for Node.JS (https://www.npmjs.com/package/knx) which supports multicast.


- Easily import your group addresses from a CSV file exported via ETS, and define your devices as individual nodes in a flow or,
- Handle arbitrary KXN telegrams by using a pair of generic in/out nodes.

### Installation

```sh
cd ~/.node-red
npm install node-red-contrib-knxjs
```

### Nodes added by this package

#### - knx-device

A node that represents a controllable KNX device. Provides the  ability to
- *control* device via node messages that flow into its *input* connector:

```js
{msg: {payload: true}}
```
will turn on a KNX switch

- *inject* messages (via its *output* connector) into a flow when a device status changes.

```js
{
    topic: <knx device node name>,
    payload: {'oldval': <old value>, 'newval': <new value>)
}
```

You can define a device by
- *manually* adding its control and status group address, OR
- you can import a CSV from ETS that contains all your group addresses.

The latter is preferred whenever you want to define multiple devices for your flows.


#### - knx-out

KNX/EIB output node that can send raw KNX telegrams to arbitrary GA's and datatypes, so it can be used with function blocks.

#### - knx-in

KNX/EIB listener node, who emits flow messages based on activity on the KNX bus:

Both `knx-in` and `knx-out` use the same message format, an example message follows:

```js
{ "topic": "knx: write",
  "payload": {
    "srcphy": "1.1.11",
    "dstgad": "0/0/15",
    "value": [12,65]
  }
}
```

Notice: the KNX wire protocol does **not** carry information about the DPT (datapoint type), hence the interpretation of the value is up to you (in the example above, this is a 16-bit floating point representing a temperature in degrees Celcius).
If you're interested in getting meaningful values out of KNX telegrams, you need to use the `knx-device` node (see above).

 - **topic**: *"knx: (telegram type)"* where (telegram type) is 'read' (for read requests), 'respond' (for responses to read requests) and 'write' (to write GA values)

 - **payload.srcphy**: source physical address (the device that sent the KNX/EIB telegram)

 - **payload.dstgad**: destination group address (the function that this telegram refers to eg. front porch lights)

 - **dpt**: for write requests, you can optionally specify the datapoint type (eg. `DPT1` for booleans, `DPT5` for 4-bit dimming setpoints etc) - this permits you to *write* complex DPT's to the bus

 - **value**: the destination group address's value conveyed in the telegram in raw format (if you're not supplying a dpt), or in the format expected by the DPT (see [relevant table](https://bitbucket.org/ekarak/knx.js/src/master/README-datapoints.md?fileviewer=file-view-default) for what kind of data values you can send to the KNX library).

### Configuration Nodes

#### - knx-controller

A hidden CONFIG node that lets you define connection properties for your KNX installation. Defaults to a **router/multicast** connection to 224.0.23.12, so if you have a KNX IP router on your LAN, you can use this without further ado.
**Please note**: if you use `eibd` or `knxd` as your IP router, and you have it running on the **same** box as your Node-Red, it will DROP multicast packets coming from the same source IP address.

`Layer 0 [11:server/Server     7.133] Dropped(017): 06 10 05 30 00 11 29 00 BC D0 11 64 29 0F 01 00 80`

The trick here (although not entirely within the specs) is to use the loopback interface, so if you define the KNX controller address/port to 127.0.0.1:3671 it will bypass the source address check (and happily route your packets down your USB or TPUART interface)


#### - ets-csv-export

An encapsulator object for your CSV file of your exported group addresses. You can
define this in order to be able to pick a group address in a 'knx-device' node.
