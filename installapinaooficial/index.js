const { Client, MessageMedia, LocalAuth, Buttons, List } = require('whatsapp-web.js');
const express = require('express');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const port = 4500; //process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/*
const io = socketIO(server,{
  cors: {
          origin: "https://isniapps.net",
          methods: ["GET", "POST"],
          credentials: true,
          transports: ['websocket', 'polling'],
  },
  allowEIO3: true
}); 
*/

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));


app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

const createSessionsFileIfNotExists = function() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log('Sessions file created successfully.');
    } catch(err) {
      console.log('Failed to create sessions file: ', err);
    }
  }
}

createSessionsFileIfNotExists();

const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

const getSessionsFile = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}

const createSession = function(id, description) {
  console.log('Creating session: ' + id);
  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
      ],
    },
    authStrategy: new LocalAuth({
      clientId: id
    })
  });

  client.initialize();

  client.on('qr', (qr) => {
    //console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit('qr', { id: id, src: url });
      io.emit('message', { id: id, text: 'QR code criado, leia ele por favor!' });
    });
  });

  client.on('ready', () => {
    io.emit('ready', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp está conectado!' });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  client.on('authenticated', () => {
    io.emit('authenticated', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp está autenticado!' });
  });

  client.on('auth_failure', function() {
    io.emit('message', { id: id, text: 'Falha de autenticação, reiniciando...' });
  });

  client.on('disconnected', (reason) => {
    io.emit('message', { id: id, text: 'Whatsapp está desconectado!' });
    client.destroy();
    client.initialize();

    // Menghapus pada file sessions
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit('remove-session', id);
  });

  /*************************************************************
   * *********************************************************
   * ********************************************************** */ 
  client.on('message', async msg => {
    console.log('MESSAGE RECEIVED', ( msg.body ? msg.body : '' ));

    var arrComandos = new Array();
    arrComandos.push( '!ping --> retorna pong' );
    arrComandos.push( '!ping reply --> retorna pong como resposta' );
    arrComandos.push( '!sendto 55XX9999999 Mensagem --> manda p 55.. uma msg' );
    arrComandos.push( '!reaction --> reage a ultima msg' );
    arrComandos.push( '!echo MSG --> retorna MSG de volta' );
    arrComandos.push( '!info --> imprime dados do contato' );
    arrComandos.push( '!mention --> retorna seu nome' );
    arrComandos.push( '!typing --> simula um "digitando" ' );
    arrComandos.push( '!clearstate --> retira o "digitando" ' );
    
    if (msg.body === '!ping reply') {
        // Send a new message as a reply to the current one
        msg.reply('pong');

    } else if (msg.body === '!ping') {
        // Send a new message to the same chat
        client.sendMessage(msg.from, 'pong');

    } else if (msg.body.startsWith('!sendto ')) {
        // Direct send a new message to specific id
        let number = msg.body.split(' ')[1];
        let messageIndex = msg.body.indexOf(number) + number.length;
        let message = msg.body.slice(messageIndex, msg.body.length);

        client.sendMessage(msg.from, `vou tentar mandar ${message} para ${number}` );

        number = number.includes('@c.us') ? number : `${number}@c.us`;
        let chat = await msg.getChat();
        chat.sendSeen();
        setTimeout( function(){
                      client.sendMessage(number, message);
                    }, 2000 );
    } else if (msg.body.startsWith('!echo ')) {
        // Replies with the same message
        msg.reply(msg.body.slice(6));
    } else if (msg.body === '!info') {
        let info = client.info;
        client.sendMessage(msg.from, `
            *Connection info*
            User name: ${info.pushname}
            My number: ${info.wid.user}
            Platform: ${info.platform}
        `);
    } else if (msg.body === '!mention') {
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        chat.sendMessage(`Hi @${contact.number}!`, {
            mentions: [contact]
        });
    } else if (msg.body === '!pin') {
        const chat = await msg.getChat();
        await chat.pin();
    } else if (msg.body === '!typing') {
        const chat = await msg.getChat();
        // simulates typing in the chat
        chat.sendStateTyping();
    } else if (msg.body === '!clearstate') {
        const chat = await msg.getChat();
        // stops typing or recording in the chat
        chat.clearState();
    } else if (msg.body === '!buttons') {
        let button = new Buttons('Button body',[{id:'idbt1', body:'bt1'},{body:'bt2'},{body:'bt3'},{body:'bt4'}],'title','footer');
        client.sendMessage(msg.from, button);
    } else if (msg.body === '!buttons2') {
        let button = new Buttons('Button body',[{buttonId:'idbt1', body:'bt1'},{body:'bt2'},{body:'bt3'},{body:'bt4'}],'title','footer');
        client.sendMessage(msg.from, button);
    } else if (msg.body === '!list') {
        let sections = [{title:'sectionTitle1',rows:[{id:'id1.1', title:'ListItem1', description: 'desc 1'},{id:'id1.2', title:'ListItem2', description: 'desc 2'}]},
                        {title:'sectionTitle2',rows:[{id:'id2.3', title:'ListItem3', description: 'desc 3'},{id:'id2.4', title:'ListItem4', description: 'desc 4'}]} ];
        let list = new List('List body','btnText',sections,'Title','footer');
        client.sendMessage(msg.from, list);
    } else if (msg.body === '!list2') {
        let sections = [{rows:[{title:'ListItem1', description: 'desc 1'},{title:'ListItem2', description: 'desc 2'}]} ];
        let list = new List('Msg corpo','btn Chama',sections,'Titulo','Rodape da msg');
        client.sendMessage(msg.from, list);
    } else if (msg.body === '!list3') {
        let sections = [{title:'ListItem1', description: 'desc 1'},{title:'ListItem2', description: 'desc 2'}];
        let list = new List('Msg corpo','btn Chama',sections,'Titulo','Rodape da msg');
        client.sendMessage(msg.from, list);
    } else if (msg.body === '!reaction') {
        msg.react('👍');
    }
    else{
        msg.react('😕');
        //msg.reply('não entendi');

        const contact = await msg.getContact();
        const chat = await msg.getChat();

        chat.sendStateTyping();
        chat.sendMessage(`Não entendi @${contact.number} o seu comando!`, {
          mentions: [contact]
        });

        setTimeout( function(){

          var sComandos = '';
          for( var i=0; i<arrComandos.length; i++ ){
             sComandos += arrComandos[i] + '\n';
          }
          
          var sIdBtn = '';
          if( msg.type == 'buttons_response' ){
              sIdBtn = msg.selectedButtonId;
          }
          
          if( sIdBtn != '' ){
              sIdBtn = 'IdResp: ' + sIdBtn + '\n';
          }
  
          //msg.reply('Só entendo isso:\n' + sComandos );
          client.sendMessage( msg.from, sIdBtn + 'Só entendo isso:\n' + sComandos );
        }, 3000 );

      }
  });

  client.on('message_create', (msg) => {
      // Fired on all message creations, including your own
      if (msg.fromMe) {
          // do stuff here
      }
  });

  client.on('message_revoke_everyone', async (after, before) => {
      // Fired whenever a message is deleted by anyone (including you)
      console.log(after); // message after it was deleted.
      if (before) {
          console.log(before); // message before it was deleted.
      }
  });

  client.on('message_revoke_me', async (msg) => {
      // Fired whenever a message is only deleted in your own view.
      console.log(msg.body); // message before it was deleted.
  });

  client.on('message_ack', (msg, ack) => {
      /*
          == ACK VALUES ==
          ACK_ERROR: -1
          ACK_PENDING: 0
          ACK_SERVER: 1
          ACK_DEVICE: 2
          ACK_READ: 3
          ACK_PLAYED: 4
      */
      /*
      const quotedMsg = await msg.getQuotedMessage();
      console.log( `ID: ${quotedMsg.id._serialized}, ack: ` + ack );
      */
      //console.log( `ack: ` + ack );
  });

  client.on('group_join', (notification) => {
      // User has joined or been added to the group.
      console.log('join', notification);
      notification.reply('User joined.');
  });

  client.on('group_leave', (notification) => {
      // User has left or been kicked from the group.
      console.log('leave', notification);
      notification.reply('User left.');
  });

  client.on('group_update', (notification) => {
      // Group picture, subject or description has been updated.
      console.log('update', notification);
  });

  client.on('change_state', state => {
      console.log('CHANGE STATE', state );
  });

  client.on('disconnected', (reason) => {
      console.log('Client was logged out', reason);
  });
 
  /*************************************************************
   * *********************************************************
   * ********************************************************** */ 


  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
}

const init = function(socket) {
  const savedSessions = getSessionsFile();

  if (savedSessions.length > 0) {
    if (socket) {
      /**
       * At the first time of running (e.g. restarting the server), our client is not ready yet!
       * It will need several time to authenticating.
       * 
       * So to make people not confused for the 'ready' status
       * We need to make it as FALSE for this condition
       */
      savedSessions.forEach((e, i, arr) => {
        arr[i].ready = false;
      });

      socket.emit('init', savedSessions);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.description);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {
  init(socket);

  socket.on('create-session', function(data) {
    console.log('Create session: ' + data.id);
    createSession(data.id, data.description);
  });
});

// Send message
app.post('/send-message', async (req, res) => {
      console.log(req);

      const sender = req.body.sender;
      const number = phoneNumberFormatter(req.body.number);
      const message = req.body.message;

      if (!sender) {
        return res.status(422).json({
          status: false,
          message: `The sender is empty!`
        })
      }

      const client = sessions.find(sess => sess.id == sender).client;

      // Make sure the sender is exists & ready
      if (!client) {
        return res.status(422).json({
          status: false,
          message: `The sender: ${sender} is not found!`
        })
      }

      /**
       * Check if the number is already registered
       * Copied from app.js
       * 
       * Please check app.js for more validations example
       * You can add the same here!
       */
      const isRegisteredNumber = await client.isRegisteredUser(number);

      if (!isRegisteredNumber) {
        return res.status(422).json({
          status: false,
          message: 'The number is not registered'
        });
      }

      client.sendMessage(number, message).then(response => {
        res.status(200).json({
          status: true,
          response: response
        });
      }).catch(err => {
        res.status(500).json({
          status: false,
          response: err
        });
      });
});

app.get('/excluisession/:id', async (req, res) => {
    var sender = req.params.id;

    const oSessao = sessions.find(sess => sess.id == sender);
    if (!oSessao) {
      return res.status(422).send( `The sender: ${sender} is not found!` );
    }
    
    const client = oSessao.client;
    if (!client) {
      return res.status(422).send( `The sender.client is empty!` );
    }

    //res.send('sessao a ser excluida: ' + sender );
    //return res.status(422).send( 'xxx' );

    try {
        io.emit('message', { id: sender, text: 'Whatsapp está desconectado!' });

        client.logout();
        client.destroy();

        // Menghapus pada file sessions
        const savedSessions = getSessionsFile();
        const sessionIndex = savedSessions.findIndex(sess => sess.id == sender);
        savedSessions.splice(sessionIndex, 1);
        setSessionsFile(savedSessions);

        io.emit('remove-session', sender);

        res.status(200).send( 'Conexao WA removida' );
      }catch(err){
        return res.status(422).send( dumpError(err) );
    }
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});

function dumpError(err) {
  var sMsg = "";
  if (typeof err === 'object') {
    if (err.message) {
      sMsg = '\nMessage: ' + err.message;
    }
    if (err.stack) {
      sMsg += '\nStacktrace:';
      sMsg += '====================';
      sMsg += err.stack;
    }
  } else {
    sMsg += 'dumpError :: argument is not an object';
  }

  return sMsg;
}