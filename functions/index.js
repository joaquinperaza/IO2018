'use strict';

process.env.DEBUG = 'actions-on-google:*';
var firebase = require("firebase");

const Assistant = require('actions-on-google').ApiAiAssistant;
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const db = admin.database().ref('/userdata');
const tokendb = admin.database().ref('/token');
// API.AI Intent names
const STATUS_INTENT = 'dronestatus';
const BIND_INTENT = 'binddrone';
const ADDPLACE_INTENT = 'addplace';
const HOVERREQ_INTENT = 'hoveraprove';
const HOVERQ_INTENT = 'hoverqueue';
const LAND_INTENT = 'land';
const GOTO_INTENT = 'goto';
const GOTOAUTH_INTENT = 'gotoauth';
const LISTNOW_INTENT = 'listnow';
const RESET_INTENT = 'reset';

// Contexts
const WELCOME_CONTEXT = 'welcome';
const MISSING_CONTEXT = 'nodrone';
const NEW_CONTEXT = 'newadded';
const FOUND_CONTEXT = 'dronefounded';
const HOVERQ_CONTEXT = 'askrfreehover';
const FLYING_CONTEXT = 'onair';
const LANDING_CONTEXT = 'landing';
const LISTPLACES_CONTEXT = 'waitingtolist';
const GOTOAUTH_CONTEXT = 'waitingtofly';

// Context Parameters
const ID_PARAM = 'id';
const BRANCH_PARAM = 'branch';
const PLACENAME_PARAM = 'placename';
const TOKEN_PARAM = 'token';
const USERID_PARAM = 'userID';
const FOUND_PARAM = 'found';

exports.assistantpilot = functions.https.onRequest((request, response) => {
    console.log('headers: ' + JSON.stringify(request.headers));
    console.log('body: ' + JSON.stringify(request.body));
    const assistant = new Assistant({
        request: request,
        response: response
    });
    const user_id = assistant.getUser().userId;
    const user = db.child(user_id);
    const userdrone = user.child('connected');
    const queue = user.child('queue');
    const waitingauth = user.child('waitingauth');
    const places = user.child('places');

    let actionMap = new Map();
    actionMap.set(STATUS_INTENT, status);
    actionMap.set(BIND_INTENT, addDrone);
    actionMap.set(ADDPLACE_INTENT, addPlace);
    actionMap.set(HOVERREQ_INTENT, authHover);
    actionMap.set(HOVERQ_INTENT, startHover);
    actionMap.set(LAND_INTENT, land);
    actionMap.set(GOTO_INTENT, goTo);
    actionMap.set(GOTOAUTH_INTENT, gotoAuth);
    actionMap.set(LISTNOW_INTENT, listNow);
    actionMap.set(RESET_INTENT, reset);
    assistant.handleRequest(actionMap);


    function startHover(assistant) {

        userdrone.once('value', function (snapshot) {

            if (snapshot.val() == null) {
                const speech = `<speak> It look's like your drone've disconnected </speak>`;
                assistant.setContext(MISSING_CONTEXT, 1, parameters);
                assistant.ask(speech);
            } else {
                var drone = snapshot.val();
                queue.set({
                    mode: 'hover',
                    land: false
                });
                const speech = `<speak>${drone.name}, is taking off, let me know if you want to flight somewhere or land.</speak>`;
                const parameters = {};
                assistant.setContext(FLYING_CONTEXT, 15, parameters);
                assistant.ask(speech);
            }

        })
    }

    function land(assistant) {

        userdrone.once('value', function (snapshot) {
            if (snapshot.val() == null) {
                const speech = `<speak> It look's like your drone've disconnected, try landing with the controller </speak>`;
                assistant.setContext(MISSING_CONTEXT, 1, parameters);
                assistant.ask(speech);
            } else {
                var drone = snapshot.val();
                queue.set({
                    mode: 'land',
                    land: true
                });
                const speech = `<speak>OK, ${drone.name}, is returning to home and landing</speak>`;
                const parameters = {};
                assistant.setContext(LANDING_CONTEXT, 15, parameters);
                assistant.ask(speech);
            }

        })
    }

    function authHover(assistant) {

        userdrone.once('value', function (snapshot) {
            if (snapshot.val() == null) {

                const speech = `<speak> I can not found a drone linked to your account. Do you want to bind a new drone? </speak>`;
                const parameters = {};
                assistant.setContext(MISSING_CONTEXT, 1, parameters);
                assistant.ask(speech);
            } else {
                var drone = snapshot.val();
                const speech = `<speak>Sure, but before taking off, let check that your ${drone.name} is ready to take off. Is it ready?</speak>`;
                const parameters = {};
                assistant.setContext(HOVERQ_CONTEXT, 5, parameters);
                assistant.ask(speech);
            }

        })

    }

    function addPlace(assistant) {
        const name = assistant.getArgument(PLACENAME_PARAM);
        userdrone.once('value', function (snapshot) {
            places.child(name).set(snapshot.val().location);
            const speech = `<speak> Great! Now I will rember current drone location as ${name}</speak>`;
            assistant.ask(speech);
        })
    }

    function reset(assistant) {
        user.child("token").set(Math.random().toString(36).substr(2));
            const speech = `<speak> I have successfully unliked all your drones</speak>`;
            assistant.ask(speech);

    }

    function goTo(assistant) {
        const name = assistant.getArgument(PLACENAME_PARAM);
        places.once('value', function (snapshot) {

            if (snapshot.val() == null) {
                var drone = {
                    exist: false
                };

                const speech = `<speak> I can not found any place stored in your account, I can rember places when drone is flying </speak>`;
                const parameters = {};

                assistant.ask(speech);
            } else if (snapshot.child(name).val() == null) {

                const speech = `<speak>${name} isn't in your account, do you want to listen your places?</speak>`;
                const parameters = {};
                assistant.setContext(LISTPLACES_CONTEXT, 2, parameters);
                assistant.ask(speech);
            } else if (snapshot.child(name).val() != null) {
                waitingauth.set({
                    mode: 'goto',
                    place: name,
                    land: false
                });
                const speech = `<speak>Just to confirm, is ok to take off your drone now and fly to ${name}?</speak>`;
                const parameters = {};
                assistant.setContext(GOTOAUTH_CONTEXT, 2, parameters);
                assistant.ask(speech);
            }

        })

    }

    function listNow(assistant) {

            places.once('value', function (snapshot) {
                if (snapshot.val() != null) {

                var speech = `<speak> I Have this places rember for you,`;
                snapshot.forEach(function (childSnapshot) {
                    speech += ` ${childSnapshot.key}, `;
                })
                speech += `</speak>`;
                assistant.ask(speech);
                    } else {
            var speech = `<speak> I don't have any places in your account, try adding them while flying your drone</speak>`;
            assistant.ask(speech);
        }
            })

    }

    function gotoAuth(assistant) {

         waitingauth.once('value', function (snapshot) {

            if (snapshot.val() == null) {
                const speech = `<speak> It look's like your drone've disconnected </speak>`;
                assistant.setContext(MISSING_CONTEXT, 1, parameters);
                assistant.ask(speech);
            } else {
                queue.set(snapshot.val());
                const speech = `<speak>OK, starting flight to ${snapshot.val().place} , let me know if you want to stop flight or land.</speak>`;
                const parameters = {};
                assistant.setContext(FLYING_CONTEXT, 15, parameters);
                assistant.ask(speech);
            }

        })

    }

    function addDrone(assistant) {
        const token = String(assistant.getArgument(TOKEN_PARAM));
        tokendb.child(token).set({
            userID: user_id,
            age: Firebase.ServerValue.TIMESTAMP
        });

        const speech = `<speak>Great, your drone i d ${token} has been linked with your account.</speak>`;

        const parameters = {};

        parameters[USERID_PARAM] = user_id;
        assistant.setContext(NEW_CONTEXT, 5, parameters);
        assistant.ask(speech);
    }

    function status(assistant) {
        userdrone.once('value', function (snapshot) {

            if (snapshot.val() == null) {
                var drone = {
                    exist: false
                };

                const speech = `<speak> I can not found a drone linked to your account. Do you want to bind a new drone? </speak>`;
                const parameters = {};
                parameters[FOUND_PARAM] = false;

                assistant.setContext(MISSING_CONTEXT, 1, parameters);
                assistant.ask(speech);
            } else {
                var drone = snapshot.val();
                const speech = `<speak>I have found ${drone.name}, it's ${drone.state} and now it has ${drone.bat}% remainig battery</speak>`;
                const parameters = {};
                parameters[FOUND_PARAM] = true;

                assistant.setContext(FOUND_CONTEXT, 5, parameters);
                assistant.ask(speech);
            }

        })

    }





})
