const { create, Client } = require('@open-wa/wa-automate');
const options = require('./options');
const chalk = require('chalk');
const moment = require('moment-timezone');
moment.tz.setDefault('America/Sao_Paulo').locale('pt-br');
const csv = require('csv-parser');
const fs = require('fs');
const { Parser } = require('json2csv');
const filePath = 'contacts.csv'; // Nome do CSV que deseja verificar

// Função para ler o CSV e retornar uma lista de contatos
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data)) // Extrai a linha inteira do CSV
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Função para salvar dados no CSV
function saveToCSV(filePath, data) {
  const json2csvParser = new Parser();
  const csvData = json2csvParser.parse(data);
  fs.writeFileSync(filePath, csvData, 'utf8');
}

// Função para salvar dados no arquivo .txt
function saveToTXT(filePath, data) {
  fs.writeFileSync(filePath, data.join('\n'), 'utf8');
}


// Inicia o client
const start = async (client = new Client()) => {
  console.log(chalk.cyan("[SERVER]"), chalk.white("Servidor iniciado com sucesso!"));
  console.log(chalk.cyan("[SERVER]"), chalk.white("Servidor desenvolvido por", chalk.blue("Eduardo Mendes")));

  client.onStateChanged((state) => {
    console.log(chalk.cyan("Status do Cliente:"), chalk.white(state));
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') client.forceRefocus();
  });

  //Mensagens recebidas no console
  client.onMessage(async (message) => {
    const time = moment(message.t * 1000).format('DD/MM HH:mm:ss');
    if (message.from != "status@broadcast") {
      console.log(chalk.cyan(`[${time}]`), chalk.green(`${message.from.replace("@c.us", "")}:`), chalk.white(message.body));
    }

    // Cancela mensagens em grupo
    if (message.isGroupMsg) return;

    // Comando para iniciar a verificação
    if (message.body == "/testarcsv") {
      await client.sendText(message.from, "Iniciando verificação dos contatos no CSV, aguarde...");

      let count = 0 // Contador de contatos testados

      try {
        const contacts = await readCSV(filePath);
        const contactsWithWhatsApp = [];
        const contactsWithoutWhatsApp = [];

        for (const contact of contacts) {
          //Caso o número NÃO esteja no formato +55 11 99999-9999, remova o replace.
          const phoneNumber = contact['Phone 1 - Value'].replace(/^\+55\s*/, '').replace(/\s/g, '').replace(/-/g, '');
          if (!phoneNumber) continue; // Ignora entradas vazias
          const formattedNumber = `55${phoneNumber}@c.us`;
          const isRegistered = await client.checkNumberStatus(formattedNumber);

          // Mensagem no console
          count += 1
          let registred = isRegistered.canReceiveMessage ? chalk.green("Número existe!") : chalk.red("Número inexistente!")
          console.log(chalk.cyan(`[${count}]`), chalk.white(`Testando ${phoneNumber}`), registred);

          // Salva os números em um novo CSV ou no TXT
          if (isRegistered.canReceiveMessage) {
            contactsWithWhatsApp.push(contact);
          } else {
            const name = contact['Name'];
            contactsWithoutWhatsApp.push(`${name} » wa.me/55${phoneNumber}`);
          }
        }

        // Arquivos responsaveis para salvar os contatos.
        saveToCSV('Com_WhatsApp.csv', contactsWithWhatsApp);
        saveToTXT('Sem_WhatsApp.txt', contactsWithoutWhatsApp);

        await client.sendText(message.from, "Verificação concluída! Resultados salvos em 'Com_WhatsApp.csv' e 'Sem_WhatsApp.txt'.");
      } catch (error) {
        console.error('Erro ao processar o CSV:', error);
        await client.sendText(message.from, "Ocorreu um erro ao processar o CSV.");
      }
    }
  });

  // Bloqueia chamadas e bloqueia quem ligar
  client.onIncomingCall(async (call) => {
    console.log(chalk.red("LIGAÇÃO RECEBIDA:"), chalk.white(call));
    await client.sendText(call.peerJid, "Chamadas são desabilitadas neste número, portanto você será bloqueado(a)!")
      .then(() => client.contactBlock(call.peerJid));
  });
};

create(options(true, start))
  .then((client) => start(client))
  .catch((error) => console.log(error));