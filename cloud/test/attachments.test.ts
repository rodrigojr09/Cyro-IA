import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatSchema, inputReservation } from '@jarvis/shared/schemas';
import { body, HttpError } from '../lib/http';

// Minimal SOF marker for validation boundaries, never sent to a paid provider.
const jpeg = (width=1536,height=1024) => {
  const bytes = Buffer.from([255,216,255,192,0,8,8,0,0,0,0,1]);
  bytes.writeUInt16BE(height,7); bytes.writeUInt16BE(width,9);
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
};
const part = (url=jpeg()) => ({type:'image_url',image_url:{url,detail:'auto'}});
const input = (parts: object[]) => ({model:'gpt-4.1-mini',messages:[{role:'user',content:parts}]});

test('vision accepts five bounded local images; denies remote URLs, excessive count/dimensions and other roles', () => {
  assert.equal(chatSchema.safeParse(input(Array.from({length:5},()=>part()))).success,true);
  for (const parts of [Array.from({length:6},()=>part()), [part('https://example.test/image.jpg')], [part('file:///private/photo.jpg')], [part(jpeg(1537))], [part('data:image/jpeg;base64,broken')]])
    assert.equal(chatSchema.safeParse(input(parts)).success,false);
  assert.equal(chatSchema.safeParse({model:'test',messages:[{role:'system',content:[part()]}]}).success,false);
  assert.equal(chatSchema.safeParse(input([{type:'file',file_id:'server-upload'}])).success,false);
});

test('image reservations count bounded vision tokens instead of treating base64 as plain text', () => {
  const parsed = chatSchema.parse(input(Array.from({length:5},()=>part())));
  assert.equal(inputReservation(parsed.messages,parsed.model),5*4096+16);
  assert.equal(inputReservation([{content:'hello'}],'gpt-4.1-mini'),21);
});

test('only explicitly enlarged chat reader accepts image-sized bodies; other endpoints stay at 128 KiB', async () => {
  const data = JSON.stringify({payload:'x'.repeat(200000)});
  const request = () => new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:data});
  const { z } = await import('zod');
  await assert.rejects(body(request(),z.object({payload:z.string()})), error => error instanceof HttpError && error.status===413);
  const parsed = await body(request(),z.object({payload:z.string()}),4*1024*1024);
  assert.equal(parsed.payload.length,200000);
});
