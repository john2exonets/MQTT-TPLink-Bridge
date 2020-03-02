# MQTT-TPLink-Bridge
An MQTT to TP-Link Device Bridge.

This program allows for control and monitoring of TP-Link lights and plugs using MQTT packets.

Since the "Light" and "Plug" devices have slightly different JSON parameters, there are two sets of control functions for each type. The MQTT Topic heads can be specified in the config.json file. You will have to pre-define the TP-Link devices you want to control in the config.json file. I have included an example config.json file.

