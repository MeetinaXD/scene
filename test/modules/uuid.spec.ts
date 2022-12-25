import { uuid } from '../../src/helper';
import { untilCbCalled } from '../utils';

describe('uuid', () => {
  test('generate 10000 uuids, 100 per times and interval 10 ms', async () => {
    const total = 10000;
    const perTimes = 100;
    const uuidMap = {} as Record<string, any>;
    for (let i = 0; i < total / perTimes; i++) {
      for (let j = 0; j < perTimes; j++) {
        uuidMap[uuid()] = 1;
      }
      await untilCbCalled(setTimeout, 10);
    }
    expect(Object.keys(uuidMap)).toHaveLength(total);
  });

  test('generate 10000 uuids, 1000 per times and interval 50 ms', async () => {
    const total = 10000;
    const perTimes = 1000;
    const uuidMap = {} as Record<string, any>;
    for (let i = 0; i < total / perTimes; i++) {
      for (let j = 0; j < perTimes; j++) {
        uuidMap[uuid()] = 1;
      }
      await untilCbCalled(setTimeout, 50);
    }
    expect(Object.keys(uuidMap)).toHaveLength(total);
  });
});
