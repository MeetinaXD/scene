import { createAlova, Method } from 'alova';
import vueHook from 'alova/vue';
import { SilentMethod } from '../../src/hooks/silent/SilentMethod';
import { pushNewSilentMethod2Queue } from '../../src/hooks/silent/silentQueue';
import { filterSilentMethods, getSilentMethod } from '../../src/hooks/silent/virtualResponse/filterSilentMethods';
import { mockRequestAdapter } from '../mockData';

const alovaInst = createAlova({
  baseURL: 'http://xxx',
  statesHook: vueHook,
  requestAdapter: mockRequestAdapter
});
describe('silentMethods filter', () => {
  test('filterSilentMethods', () => {
    const createMethod = (name: string) =>
      new Method('POST', alovaInst, '/detail', {
        name
      });
    const silentMethodInstance = new SilentMethod(createMethod('aa'), 'silent');
    const silentMethodInstance2 = new SilentMethod(createMethod('bb'), 'silent');
    const silentMethodInstance3 = new SilentMethod(createMethod('cb'), 'silent');
    pushNewSilentMethod2Queue(silentMethodInstance, false);
    pushNewSilentMethod2Queue(silentMethodInstance2, false);
    pushNewSilentMethod2Queue(silentMethodInstance3, false);

    // 匹配第二个
    let smAry = filterSilentMethods('bb');
    expect(smAry).toHaveLength(1);
    expect(smAry[0]).toBe(silentMethodInstance2);

    // 不匹配
    smAry = filterSilentMethods('dd');
    expect(smAry).toHaveLength(0);

    // 匹配第二和第三个
    smAry = filterSilentMethods(/b$/);
    expect(smAry).toHaveLength(2);
    expect(smAry[0]).toBe(silentMethodInstance2);
    expect(smAry[1]).toBe(silentMethodInstance3);

    // 不匹配
    smAry = filterSilentMethods(/ab$/);
    expect(smAry).toHaveLength(0);

    // 不在同一个队列，不匹配
    smAry = filterSilentMethods(/b$/, 'emptyQueue');
    expect(smAry).toHaveLength(0);
  });

  test('getSilentMethod', () => {
    const createMethod = (name: string) =>
      new Method('POST', alovaInst, '/detail', {
        name
      });
    const silentMethodInstance = new SilentMethod(createMethod('aa'), 'silent');
    const silentMethodInstance2 = new SilentMethod(createMethod('bb'), 'silent');
    const silentMethodInstance3 = new SilentMethod(createMethod('cb'), 'silent');
    const silentMethodInstance4 = new SilentMethod(createMethod(''), 'silent');
    pushNewSilentMethod2Queue(silentMethodInstance, false, 'queue2');
    pushNewSilentMethod2Queue(silentMethodInstance2, false, 'queue2');
    pushNewSilentMethod2Queue(silentMethodInstance3, false, 'queue2');
    pushNewSilentMethod2Queue(silentMethodInstance4, false, 'queue2');

    // 匹配第二个
    let matchedSM = getSilentMethod('bb', 'queue2');
    expect(matchedSM).toBe(silentMethodInstance2);

    // 不匹配
    matchedSM = getSilentMethod('dd', 'queue2');
    expect(matchedSM).toBeUndefined();

    // 匹配第二和第三个，但只返回前一个
    matchedSM = getSilentMethod(/b$/, 'queue2');
    expect(matchedSM).toBe(silentMethodInstance2);

    // 不匹配
    matchedSM = getSilentMethod(/ab$/, 'queue2');
    expect(matchedSM).toBeUndefined();

    // 不在同一个队列，不匹配
    matchedSM = getSilentMethod(/b$/, 'emptyQueue');
    expect(matchedSM).toBeUndefined();
  });
});
