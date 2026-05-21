const { createClient } = require('redis');

const client = createClient({
    url: 'redis://:kfgnO6PbXqk8eLv0fJWn5ZrNsp2lut7h@redis-18722.crce302.ap-seast-1-3.ec2.cloud.redislabs.com:18722'
});

async function run() {
    await client.connect();

    const keys = await client.keys('admin:*');
    console.log('📦 KEYS:', keys);

    for (const key of keys) {
        const type = await client.type(key);
        const ttl = await client.ttl(key);

        console.log('--------------------');
        console.log('KEY:', key);
        console.log('TYPE:', type);
        console.log('TTL:', ttl);

        if (type === 'string') {
            const value = await client.get(key);
            console.log('VALUE:', value);
        }

        if (type === 'list') {
            const value = await client.lRange(key, 0, -1);
            console.log('VALUE (list):', value);
        }

        if (type === 'set') {
            const value = await client.sMembers(key);
            console.log('VALUE (set):', value);
        }

        if (type === 'hash') {
            const value = await client.hGetAll(key);
            console.log('VALUE (hash):', value);
        }
    }

    await client.quit();
}

run();