import { Command } from 'commander';
import figlet from 'figlet';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
dotenv.config();

//TODO env파일을 직접 손봐서 환경변수를 불러오는게 맘에 안든다
//TODO AWS credential을 일반적으로 credential 파일이 저장되는 곳에서 한번 불러와보고 있으면 그 정보들을 활용하고
//TODO 없으면 사용자에게 hidden field로 입력을 받아서 같은 디렉토리에 해싱한 후 새로운 credential 파일로 저장한 걸 계속 사용하도록 하면 어떨까
//아 뭔가 별론데 aws cli 스크립트로 해야하나

// Set AWS Credentials
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const AWS_REGION = process.env.AWS_REGION;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS Credentials environment variable must be set');
}

if (!AWS_REGION) {
  throw new Error('AWS Region environment variable must be set');
}

// Load AWS SDK
import AWS, { DynamoDB } from 'aws-sdk';

// Set the AWS Config
AWS.config.update({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// create a DynamoDB client
const client = new DynamoDB();

// print cli name as ascii art like any other cli
console.log(figlet.textSync('dynamo-table-generator'));

// create Command instance to create an app that works as a CLI
const app = new Command();

const questions = {
  environmentQuestion: () => {
    const question = [
      {
        type: 'list',
        name: 'environment',
        message: 'What environment would you like to create?',
        choices: ['Development', 'Production'],
        filter(selected: string) {
          return selected === 'Development' ? 'dev' : 'main';
        },
      },
    ];

    return inquirer.prompt(question);
  },

  tableNameQuestion: () => {
    const question = [
      {
        type: 'input',
        name: 'tableName',
        message: 'What is the name of the table?',
      },
    ];

    return inquirer.prompt(question);
  },

  useSortKey: () => {
    const question = [
      {
        type: 'list',
        name: 'useSortKey',
        message: 'Do you want to Set Sort Key too?',
        choices: ['Yes', 'No'],
        filter(selected: string) {
          return selected === 'Yes' ? true : false;
        },
      },
    ];

    return inquirer.prompt(question);
  },

  partitionKeyQuestion: () => {
    const question = [
      {
        type: 'input',
        name: 'partitionKeyName',
        message: 'What is the name of the Partition key?',
      },
      {
        type: 'list',
        name: 'partitionKeyType',
        message: 'What is the type of the Partition key?',
        choices: ['string', 'number', 'binary'],
        filter(selected: string) {
          return selected === 'string' ? 'S' : selected === 'number' ? 'N' : 'B';
        },
      },
    ];

    return inquirer.prompt(question);
  },

  sortKeyQuestion: () => {
    const question = [
      {
        type: 'input',
        name: 'sortKeyName',
        message: 'What is the name of the Sort key?',
      },
      {
        type: 'list',
        name: 'sortKeyType',
        message: 'What is the type of the Sort key?',
        choices: ['string', 'number', 'binary'],
        filter(selected: string) {
          return selected === 'string' ? 'S' : selected === 'number' ? 'N' : 'B';
        },
      },
    ];

    return inquirer.prompt(question);
  },
};

const receiver = async () => {
  const { environment } = await questions.environmentQuestion();

  const { tableName } = await questions.tableNameQuestion();

  if (!tableName) {
    throw Error('Table name must be set');
  }

  const tableList = await client.listTables().promise();

  if (tableList.TableNames?.includes(tableName + '-' + environment)) {
    throw Error('Duplicated table name exists');
  }

  const { partitionKeyName, partitionKeyType } = await questions.partitionKeyQuestion();

  if (!partitionKeyName) {
    throw Error('Partition Key name must be set');
  }

  const { useSortKey } = await questions.useSortKey();

  const { sortKeyName, sortKeyType } = useSortKey ? await questions.sortKeyQuestion() : { sortKeyName: null, sortKeyType: null };

  if (!sortKeyName) {
    throw Error('Sort Key name must be set');
  }

  const tableParams = {
    TableName: tableName + '-' + environment,
    KeySchema:
      /* eslint-disable prettier/prettier */
      useSortKey
        ? [
          {
            AttributeName: partitionKeyName,
            KeyType: 'HASH',
          },
          {
            AttributeName: sortKeyName,
            KeyType: 'RANGE',
          },
        ]
        : [
          {
            AttributeName: partitionKeyName,
            KeyType: 'HASH',
          },
        ],

    AttributeDefinitions:
      useSortKey
        ? [
          {
            AttributeName: partitionKeyName,
            AttributeType: partitionKeyType,
          },
          {
            AttributeName: sortKeyName,
            AttributeType: sortKeyType,
          },
        ]
        : [
          {
            AttributeName: partitionKeyName,
            AttributeType: partitionKeyType,
          },
        ],
    BillingMode: 'PAY_PER_REQUEST', // 'PROVISIONED' 어떻게 auto scaling을 달지?
    // ProvisionedThroughput: {
    //   ReadCapacityUnits: 1,
    //   WriteCapacityUnits: 1,
    // },
    StreamSpecification: {
      StreamEnabled: false,
    },
  };

  console.log(tableParams);

  // create a table
  client.createTable(tableParams, (err, data) => {
    if (err) {
      console.log(err);

      throw Error('Failed to create a table');
    } else {
      console.log('Table Created', data);
    }
  });
};

app.version('0.1.0').description('A CLI for creating a table for DynamoDB').action(receiver).parse(process.argv);
