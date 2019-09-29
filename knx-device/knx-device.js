module.exports = function (RED) {

  var knx = require('knx');
  var util = require('util');

  function EtsCsvExportNode(n) {
    RED.nodes.createNode(this, n);
    this.all = n.all;
  }
  //
  RED.nodes.registerType("ets-csv-export", EtsCsvExportNode);

  // =========================
  function KnxDeviceNode(config) {
  // =========================
    RED.nodes.createNode(this, config);

    var node = this;
    var KNXController = RED.nodes.getNode(config.controller);

    if (this.datapoint) this.datapoint.removeAllListeners();
    if (!KNXController) {
      node.warn("Not bound to a KNX connection");
    }

    node.log(util.format('== Initialising datapoint: %j', config));
    if (config.statusga && config.statusga != config.groupaddress) {
      this.status_dp = new knx.Datapoint({'ga': config.statusga, 'dpt': config.dpt }, KNXController.connection);
    }
    this.datapoint = new knx.Datapoint({'ga': config.groupaddress, 'dpt': config.dpt }, KNXController.connection);
    (this.status_dp || this.datapoint).on('change', function(oldval, newval) {
      // node.log(util.format('%s changed from %j to %j', node.name, oldval, newval));
      // STATUS group address change => send Node message
      var payload = {'value': newval, 'oldval': oldval};
      if (node.datapoint.dpt.subtype) {
        payload.unit = node.datapoint.dpt.subtype.unit;
        payload.desc = node.datapoint.dpt.subtype.desc;
      }
      node.send({
        'topic': node.name,
        'payload': payload
      });
      node.updateNodeStatus("red", util.format("CHANGE %j => %j", oldval, newval));
    });

    this.updateNodeStatus = function(color, msg) {
      node.status({
        fill: color, shape: "dot", text: msg
      });
      setTimeout(function() {
        node.status({
          fill: "green", shape: "dot", text:  node.datapoint.toString()
        });
      }, 500);
    };

    // incoming message from Node => write value to KNX
    this.on('input', function (msg) {
      if (!config.groupaddress || !config.controller) {
        return null;
      }
      // temporarily update node visual status
      this.updateNodeStatus("red",
        util.format("Sending %j to %s", msg.payload, config.groupaddress)
      );
      // send off KNX request to our datapoint
      if (node.datapoint) {
        switch(msg.topic) {
          case 'read':
          case 'knx: read':
            // send read request to the *status* group address, if defined
            if (node.status_dp) {
              node.status_dp.read(function(src, respvalue) {
                // read requests will emit a response when its received from the bus
                node.send({ topic: "knx: response", payload: {srcphy: src, dstgad: config.statusga, value: respvalue} });
              });
            } else {
              // if no status GA is defined, send the GroupValue_Read to the control GA
              node.datapoint.read(function(src, respvalue) {
                node.send({ topic: "knx: response", payload: {srcphy: src, dstgad: config.groupaddress, value: respvalue} });
              });
            }
            break;
          default:
            node.datapoint.write(msg.payload.value || msg.payload);
        }
      }
    });

  }
  //
  RED.nodes.registerType("knx-device", KnxDeviceNode);
};
