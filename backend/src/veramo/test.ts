import { agent } from './agent';

async function main() {
  const identifier = await agent.didManagerCreate();
  console.log('--- Identifier Details ---');
  console.log('DID:', identifier.did);
  console.log('Keys:', JSON.stringify(identifier.keys, null, 2));

  const vc = await agent.createVerifiableCredential({
    credential: {
      issuer: { id: identifier.did },
      credentialSubject: {
        id: 'urn:uuid:test',
        test: true,
      },
    },
    proofFormat: 'jwt',
  });

  const rawJwt = (vc as any).proof.jwt;
  const header = JSON.parse(Buffer.from(rawJwt.split('.')[0], 'base64url').toString('utf-8'));
  console.log('--- JWT Header ---');
  console.log(JSON.stringify(header, null, 2));

  const verification = await agent.verifyCredential({ credential: rawJwt });
  console.log('--- Verification Result ---');
  console.log('Verified:', verification.verified);
  console.log('Full Verification:', JSON.stringify(verification, null, 2));
}

main().catch(console.error);