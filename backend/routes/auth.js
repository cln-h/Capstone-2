const express = require('express');
const axios = require('axios'); // TODO: Use this for github oauth
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const router = new express.Router();
router.use(bodyParser.json());
router.use(bodyParser.json({ type: "text/*" }));
router.use(bodyParser.urlencoded({ extended: false }));
const mongoose = require('mongoose');
const { secretJwt, dbName, github_client_id, github_redirect_uri, github_client_secret } = require('../config');

mongoose.connect(`mongodb://localhost:27017/${dbName}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
require('../models/User');
require('../models/Server');

const User = mongoose.model('users');
const Server = mongoose.model('servers');

router.post('/authenticate', async (req, res) => {
  const { code } = req.body;
  
  const data = {
    'client_id': github_client_id,
    'client_secret': github_client_secret,
    'code': code,
    'redirect_uri': github_redirect_uri
  };

  axios.post('https://github.com/login/oauth/access_token', data).then(async (response) => {
    const params = new URLSearchParams(response.data);
    const access_token = params.get('access_token');

    const res = await axios.get('https://api.github.com/user', { headers: { Authorization: `token ${access_token}` } });
    return res;
  }).then(async (response) => {
    console.log('response: ', response);
    console.log('response.data: ', response.data);
    const token = jwt.sign({ username: req.username }, secretJwt);
    const collaboratorUser = await User.findOneAndUpdate({ github_userId: response.data.id }, {
      username: response.data.login,
      avatar: response.data.avatar_url,
      token: token
    }, {
      upsert: true,
      new: true
    });
    console.log('collaboratorUser: ', collaboratorUser);
    // TODO: expand upon what data is returned to the authorized user. more than avatar and username
    return res.status(200).json({
      token: token,
      github_user_info: {
        id: response.data.id,
        username: response.data.login,
        avatar: response.data.avatar_url
      }
    });
  }).catch((err) => {
    console.error(err);
    return res.status(400).json(err);
  });
});

router.post('/is-ns-owner', async (req, res) => {
  try {
    const user = await User.findOne({ token: req.body.token });
    if (!user) throw new Error('User does not exist.');
    const server = await Server.findOne({ endpoint: req.body.endpoint });
    // console.log('server: ', server);
    // console.log('server.endpoint: ', server.endpoint);
    if (!server) throw new Error('Issue finding server.');
    // console.log('serverId: ', server.ownerId);
    // console.log('userId  : ', user.github_userId);
    if (server.ownerId === user.github_userId) return res.status(200).json({"isOwner": true});
    return res.status(200).json({"isOwner": false});
  } catch (err) {
    console.log(err);
    // console.log('BAD REQUEST AT IS-NS-OWNER: ', err);
    return res.status(400).json(err);
  }
});

module.exports = router;
