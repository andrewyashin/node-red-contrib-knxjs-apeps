/*
  KNX nodes for IBM's Node-Red
  https://github.com/ekarak/node-red-contrib-KNX
  (c) 2016, Elias Karakoulakis <elias.karakoulakis@gmail.com>

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

module.exports = function(RED) {

	console.log("loading KNXnet/IP support for NodeRed");
	var knx = require('knx');
  var util = require('util');
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
		/**
		* Initialize an KNX connection
		*/
    node.log(util.format('KNX: initializing %s connection to %s:%d',
      config.conntype, config.ipAddr, config.ipPort));
    switch(config.conntype) {
      case "multicast":
        this.connection = knx.IpRoutingConnection(config);
        break;
      case "unicast":
        this.connection = knx.IpTunnelingConnection(config);
        break;
    }
    //this.connection.debug = true;
    this.connection.Connect(function() {
      node.log(util.format('KNX: successfully connected to %s:%d',
        node.config.ipAddr, node.config.ipPort));
      /* ===== KNX events ===== */
      // initialize incoming KNX event
      node.connection.on('event', function (evt, src, dest, value) {
        node.log(util.format('%s src=%s, dest=%s, val=%s', evt, src, dest, value));
        node.emit(evt, src, dest, value);
      });
      node.emit('connected');
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
		node.log('KNX: new KNX-OUT node, config: %j', config);
		RED.nodes.createNode(this, config);
		this.name = config.name;
		this.ctrl = RED.nodes.getNode(config.controller);
		var node = this;
		//
		this.on("input", function(msg) {
			//log('KNXout.onInput, msg=%j', msg);
			if (!(msg && msg.hasOwnProperty('payload'))) {
				node.log('KNXout.onInput: illegal msg.payload!');
				return;
			}
			var payload;
			switch (typeof(msg.payload)) {
				case 'object': 	payload = msg.payload; break;
				case 'string':	payload = JSON.parse(msg.payload); break;
				default:
					node.log('KNXout.onInput: illegal msg.payload type: '+typeof(msg.payload));
					return;
			}
      this.connection.write(payload.dstgad, payload.value, payload.dpt);
		});
    //
		this.on("close", function() {
			node.log('KNX: KNXOut.close');
      if (KNXController.connection) KNXController.connection.disconnect();
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
		this.inconn = null;
		var KNXController = RED.nodes.getNode(config.controller);
		/* ===== Node-Red events ===== */
		this.on("input", function(msg) {
			if (msg != null) {

			};
		});
		this.on("close", function() {
			node.log('KNXIn.close');
			if (KNXController.connection) KNXController.connection.Disconnect();
		});
//		this.on("error", function(msg) {});
    node.status({
      fill: "green",
      text: "connected",
      shape:"ring"
    });
    KNXController.on("GroupValue_Write", function(src,dest,value) {
      node.send({	topic: 'knx: write', payload: {'srcphy': src, 'dstgad': dest, 'value': value }});
    });
    KNXController.on("GroupValue_Read", function(src,dest) {
      node.send({	topic: 'knx: read', payload: {'srcphy': src, 'dstgad': dest }});
    });
    KNXController.on("GroupValue_Response", function(src,dest,value) {
      node.send({	topic: 'knx: response', payload: {'srcphy': src, 'dstgad': dest, 'value': value }});
    });
	}

	//
	RED.nodes.registerType("knx-in", KNXIn);
}
