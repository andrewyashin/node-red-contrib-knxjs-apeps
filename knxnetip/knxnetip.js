module.exports = function(RED) {
  var fs = require('fs');
  var path = require('path');
  var util = require('util');
  var knx = require('knx');

  var idleStatuses = {};
  var setNodeStatus = function(node, tempstatus) {
    node.status(tempstatus);
    setTimeout(function() {
      var idlestatus = idleStatuses[node.id];
      if (idlestatus) node.status(idlestatus);
    }, 1000);
  };

  var notificationHandler = function(evt, src, dest, value) {
    //console.trace(' evt=%s', this, evt);
    // emit the event ourselves
    this.emit('event', evt, src, dest, value);
    var payload = {
      'srcphy': src,
      'dstgad': dest
    };
    var knxevent = evt.match(/GroupValue_(.*)/);
    if (knxevent) {
      if (evt == "GroupValue_Write" || evt == "GroupValue_Response") {
        payload.value = value;
      }
      //this.log(util.format('%s %j', evt, payload));
      // set a temporary node status
      setNodeStatus(this, {
        color: 'green',
        shape: 'dot',
        text: knxevent[1] + ' ' + dest + ':' + value
      });
      // and send a Node-Red message
      this.send({
        'topic': 'knx: ' + knxevent[1].toLowerCase(),
        'payload': payload
      });
    }
  };

  /**
   * ====== KNX-CONTROLLER ================
   * Holds configuration for KNX host+port,
   * initializes new KNX connections
   * =======================================
   */
  function KNXControllerNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    this.config = config;
    this.config.ipAddr = this.config.ipAddr || '224.0.23.12';
    this.config.ipPort = this.config.ipPort || 3671;
    this.config.physAddr = this.config.physAddr || '15.15.15';
    /**
     * Initialize an KNX connection
     */
    node.log(util.format('Initializing connection to %s:%d, physical addr: %s',
      this.config.ipAddr, this.config.ipPort, this.config.physAddr));

    // get a closure for this instance
    this.notificationClosure = notificationHandler.bind(this);
    this.status({
      fill: "yellow",
      text: "connecting",
      shape: "dot"
    });

    // connect to KNX
    this.connection = knx.Connection({
      ipAddr: this.config.ipAddr,
      ipPort: this.config.ipPort,
      physAddr: this.config.physAddr,
      handlers: {
        connected: function() {
          node.log(util.format(
            'KNX: successfully connected to %s:%d as %s',
            node.config.ipAddr, node.config.ipPort, node.config.physAddr));
          var status = {
            fill: "green",
            text: "connected",
            shape: "dot"
          };
          idleStatuses[node.id] = status;
          node.status(status);
          node.emit('connected');
        },
        /* ===== bind to KNX events ===== */
        event: node.notificationClosure,
        /* ===== cleanup on KNX connection error ===== */
        error: function(msg) {
          idleStatuses[this.id] = {
            fill: "red",
            text: "connection error: " + msg,
            shape: "dot"
          };
          setNodeStatus(node, idleStatuses[this.id]);
          node.log(util.format("KNX Connection Error: %s", msg));
        }
      }
    });

    // remove the listener subscription from the FSM on close
    this.on("close", function() {
      node.log('Unbinding generic event handler');
      // Machina.JS uses off() instead of removeListener()
      this.connection.off("event", this.notificationClosure);
    });
  }

  RED.nodes.registerType("knx-controller", KNXControllerNode);

  /**
   * ====== KNX-OUT =======================
   * Sends outgoing KNX telegrams from
   * messages received via node-red flows
   * =======================================
   */
  function KNXOut(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    this.name = config.name;
    var KNXController = RED.nodes.getNode(config.controller);
    //
    this.on("input", function(msg) {
      //log('KNXout.onInput, msg=%j', msg);
      if (!(msg && msg.hasOwnProperty('payload'))) {
        node.log('KNXout.onInput: illegal msg.payload!');
        return;
      }
      var payload;
      switch (typeof(msg.payload)) {
        case 'object':
          payload = msg.payload;
          break;
        case 'string':
          payload = JSON.parse(msg.payload);
          break;
        default:
          node.log('KNXout.onInput: illegal msg.payload type: ' + typeof(
            msg.payload));
          return;
      }
      if (KNXController && KNXController.connection) {
        switch(msg.topic) {
          case 'read':
          case 'knx: read':
            KNXController.connection.read(payload.dstgad);
            break;
          case 'respond':
          case 'response' :
          case 'knx: respond':
          case 'knx: response':
            KNXController.connection.respond(payload.dstgad, payload.value, payload.dpt);
            break;
          case 'write':
          case 'knx: write':
            KNXController.connection.write(payload.dstgad, payload.value, payload.dpt);
            break;
        }
      }
    });
  }
  //
  RED.nodes.registerType("knx-out", KNXOut);

  /**
   * ====== KNX-IN ========================
   * Handles incoming KNX events, injecting
   * json into node-red flows
   * =======================================
   */
  function KNXIn(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    this.name = config.name;
    var KNXController = RED.nodes.getNode(config.controller);

    node.log('Binding KNX-In event handler');
    this.notificationClosure = notificationHandler.bind(this);
    KNXController.on("event", this.notificationClosure);
    KNXController.on("connected", function() {
      idleStatuses[node.id] = {
        fill: "green",
        text: "connected",
        shape: "ring"
      };
      setNodeStatus(node, idleStatuses[node.id]);
    });

    // remove the listener subscription on close
    this.on("close", function() {
      node.log('KNXIn.close - Unbinding generic event handler');
      KNXController.removeListener("event", this.notificationClosure);
    });

    this.on("error", function(msg) {
      node.log('KNXIn.error - ' + msg);
    });
  }

  //
  RED.nodes.registerType("knx-in", KNXIn);
};
