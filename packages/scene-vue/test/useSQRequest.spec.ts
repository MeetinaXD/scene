import { createAlova } from 'alova';
import VueHook from 'alova/vue';
import { setSilentFactoryStatus } from '../../../src/hooks/silent/globalVariables';
import { bootSilentFactory, onSilentSubmitSuccess } from '../../../src/hooks/silent/silentFactory';
import { SilentMethod } from '../../../src/hooks/silent/SilentMethod';
import { silentQueueMap } from '../../../src/hooks/silent/silentQueue';
import loadSilentQueueMapFromStorage from '../../../src/hooks/silent/storage/loadSilentQueueMapFromStorage';
import useSQRequest from '../../../src/hooks/silent/useSQRequest';
import createVirtualResponse from '../../../src/hooks/silent/virtualResponse/createVirtualResponse';
import dehydrateVData from '../../../src/hooks/silent/virtualResponse/dehydrateVData';
import stringifyVData from '../../../src/hooks/silent/virtualResponse/stringifyVData';
import Undefined from '../../../src/hooks/silent/virtualResponse/Undefined';
import updateStateEffect from '../../../src/hooks/silent/virtualResponse/updateStateEffect';
import { symbolVDataId } from '../../../src/hooks/silent/virtualResponse/variables';
import { mockRequestAdapter } from '../../../test/mockData';
import { untilCbCalled } from '../../../test/utils';
import { ScopedSQErrorEvent, ScopedSQSuccessEvent, SQHookBehavior } from '../../../typings/general';

const alovaInst = createAlova({
  baseURL: 'http://xxx',
  statesHook: VueHook,
  requestAdapter: mockRequestAdapter,
  localCache: {
    // 不设置缓存，否则有些会因为缓存而不延迟50毫秒，而导致结果不一致
    GET: 0
  }
});

let testNum = 0;
beforeEach(() => {
  // 每次运行用例前将状态重置为1，否则上面的请求错误会将状态改为2而不再执行下面的silentMethod了
  // 第一次因为还未启动，则不需要重置
  testNum > 0 && setSilentFactoryStatus(1);
  testNum++;
});

beforeAll(() => {
  bootSilentFactory({
    alova: alovaInst
  });
});
// jest.setTimeout(1000000);
describe('useSQRequest', () => {
  test('request immediately with queue behavior', async () => {
    const queue = 'tb1';
    const Get = alovaInst.Get<{ total: number; list: number[] }>('/list');
    const { loading, data, error, downloading, uploading, onSuccess, onComplete, onBeforePushQueue, onPushedQueue } =
      useSQRequest(() => Get, {
        queue
      });
    const beforePushMockFn = jest.fn();
    onBeforePushQueue(event => {
      beforePushMockFn();
      expect((event as any)[Symbol.toStringTag]).toBe('ScopedSQEvent');
      expect(event.behavior).toBe('queue');
      expect(event.method).toBe(Get);
      expect(event.silentMethod).toBeInstanceOf(SilentMethod);
      expect(event.sendArgs).toStrictEqual([]);
      expect(Object.keys(silentQueueMap[queue])).toHaveLength(0);
    });
    const pushedMockFn = jest.fn();
    onPushedQueue(event => {
      pushedMockFn();
      expect((event as any)[Symbol.toStringTag]).toBe('ScopedSQEvent');
      expect(event.behavior).toBe('queue');
      expect(event.method).toBe(Get);
      expect(event.silentMethod).toBeInstanceOf(SilentMethod);
      expect(event.sendArgs).toStrictEqual([]);
      expect(Object.keys(silentQueueMap[queue])).toHaveLength(1);
      expect(silentQueueMap[queue][0]).toBe(event.silentMethod);
    });

    expect(loading.value).toBeTruthy();
    expect(data.value).toBeUndefined();
    expect(downloading.value).toEqual({ total: 0, loaded: 0 });
    expect(uploading.value).toEqual({ total: 0, loaded: 0 });
    expect(error.value).toBeUndefined();
    // 通过decorateSuccess将成功回调参数改为事件对象了，因此强转为此对象
    const scopedSQSuccessEvent = (await untilCbCalled(onSuccess)) as unknown as ScopedSQSuccessEvent<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >;
    expect(loading.value).toBeFalsy();
    expect(data.value.total).toBe(300);
    expect(data.value.list).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(downloading.value).toEqual({ total: 0, loaded: 0 });
    expect(uploading.value).toEqual({ total: 0, loaded: 0 });
    expect(error.value).toBeUndefined();

    expect((scopedSQSuccessEvent as any)[Symbol.toStringTag]).toBe('ScopedSQSuccessEvent');
    expect(scopedSQSuccessEvent.behavior).toBe('queue');
    expect(scopedSQSuccessEvent.method).toBe(Get);
    expect(scopedSQSuccessEvent.data.total).toBe(300);
    expect(scopedSQSuccessEvent.data.list).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(scopedSQSuccessEvent.sendArgs).toStrictEqual([]);
    expect(!!scopedSQSuccessEvent.silentMethod).toBeTruthy();

    onComplete((event: any) => {
      expect(event.behavior).toBe('queue');
      expect(event.method).toBe(Get);
      expect(event.data.total).toBe(300);
      expect(event.data.list).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(event.sendArgs).toStrictEqual([]);
      expect(!!event.silentMethod).toBeTruthy();
    });

    expect(Object.keys(silentQueueMap[queue])).toHaveLength(0);
  });

  test('use send function to request with queue behavior', async () => {
    const queue = 'tb2';
    const Get = (page: number, pageSize: number) =>
      alovaInst.Get<{ total: number; list: number[] }>('/list', {
        params: {
          page,
          pageSize
        }
      });
    const { loading, data, error, downloading, uploading, send, onSuccess, onBeforePushQueue, onPushedQueue } =
      useSQRequest((page, pageSize) => Get(page, pageSize), {
        immediate: false,
        queue
      });

    const beforePushMockFn = jest.fn();
    onBeforePushQueue(event => {
      beforePushMockFn();
      expect(event.behavior).toBe('queue');
      expect(event.method.url).toBe('/list');
      expect(event.method.config.params).toStrictEqual({ page: 2, pageSize: 8 });
      expect(event.silentMethod).toBeInstanceOf(SilentMethod);
      expect(event.sendArgs).toStrictEqual([2, 8]);
    });
    const pushedMockFn = jest.fn();
    onPushedQueue(event => {
      pushedMockFn();
      expect(event.behavior).toBe('queue');
      expect(event.method.url).toBe('/list');
      expect(event.method.config.params).toStrictEqual({ page: 2, pageSize: 8 });
      expect(event.silentMethod).toBeInstanceOf(SilentMethod);
      expect(event.sendArgs).toStrictEqual([2, 8]);
    });

    expect(loading.value).toBeFalsy();
    send(2, 8); // 发送请求
    expect(loading.value).toBeTruthy();
    expect(data.value).toBeUndefined();
    expect(downloading.value).toEqual({ total: 0, loaded: 0 });
    expect(uploading.value).toEqual({ total: 0, loaded: 0 });
    expect(error.value).toBeUndefined();
    // 通过decorateSuccess将成功回调参数改为事件对象了，因此强转为此对象
    const scopedSQSuccessEvent = (await untilCbCalled(onSuccess)) as unknown as ScopedSQSuccessEvent<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >;
    expect(loading.value).toBeFalsy();
    expect(data.value.total).toBe(300);
    expect(data.value.list).toStrictEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(downloading.value).toEqual({ total: 0, loaded: 0 });
    expect(uploading.value).toEqual({ total: 0, loaded: 0 });
    expect(error.value).toBeUndefined();

    expect(scopedSQSuccessEvent.behavior).toBe('queue');
    expect(scopedSQSuccessEvent.data.total).toBe(300);
    expect(scopedSQSuccessEvent.data.list).toStrictEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(scopedSQSuccessEvent.sendArgs).toStrictEqual([2, 8]);
    expect(!!scopedSQSuccessEvent.silentMethod).toBeTruthy();
  });

  test('should emit onError immediately while request error and never retry', async () => {
    const queue = 'tb3';
    const Get = () => alovaInst.Get<never>('/list-error');
    const { loading, data, error, onError, onComplete } = useSQRequest(Get, {
      behavior: 'queue',
      queue
    });

    // 通过decorateSuccess将成功回调参数改为事件对象了，因此强转为此对象
    const scopedSQErrorEvent = (await untilCbCalled(onError)) as unknown as ScopedSQErrorEvent<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >;
    expect(loading.value).toBeFalsy();
    expect(data.value).toBeUndefined();
    expect(error.value?.message).toBe('server error');

    expect((scopedSQErrorEvent as any)[Symbol.toStringTag]).toBe('ScopedSQErrorEvent');
    expect(scopedSQErrorEvent.behavior).toBe('queue');
    expect(scopedSQErrorEvent.error.message).toBe('server error');
    expect(scopedSQErrorEvent.sendArgs).toStrictEqual([]);
    expect(scopedSQErrorEvent.silentMethod).not.toBeUndefined();
    expect(silentQueueMap[queue]).toHaveLength(0); // 在队列中移除了

    onComplete((event: any) => {
      expect((event as any)[Symbol.toStringTag]).toBe('ScopedSQCompleteEvent');
      expect(event.behavior).toBe('queue');
      expect(event.error.message).toBe('server error');
      expect(event.sendArgs).toStrictEqual([]);
      expect(event.silentMethod).not.toBeUndefined();
    });
  });

  test('should prevent to push silentMethod when return false in onBeforePushQueue', async () => {
    const queue = 'tb4';
    const Get = () => alovaInst.Get<any>('/list');
    const { onBeforePushQueue, onSuccess } = useSQRequest(Get, {
      behavior: 'queue',
      queue
    });
    onBeforePushQueue(() => {
      return false;
    });

    const successMockFn = jest.fn();
    onSuccess(successMockFn);
    await untilCbCalled(setTimeout, 0);
    expect(silentQueueMap[queue]).toStrictEqual([]);
    await untilCbCalled(setTimeout, 500);
    expect(successMockFn).not.toBeCalled();

    const { onBeforePushQueue: onBeforePushQueue2, onSuccess: onSuccess2 } = useSQRequest(Get, {
      behavior: 'queue',
      queue
    });
    onBeforePushQueue2(() => {
      return false;
    });
    onBeforePushQueue2(() => {
      return true;
    });
    onSuccess2(successMockFn);
    await untilCbCalled(setTimeout, 0);
    expect(silentQueueMap[queue]?.[0]?.active).toBeTruthy();
    await untilCbCalled(setTimeout, 500);
    expect(successMockFn).toBeCalledTimes(1);
  });

  test('should be the same as useRequest when behavior is static', async () => {
    const queue = 'tb5';
    const Get = () => alovaInst.Get<never>('/list');
    const { loading, data, error, onSuccess, onBeforePushQueue, onPushedQueue } = useSQRequest(Get, {
      behavior: () => 'static',
      queue
    });

    const pushMockFn = jest.fn();
    onBeforePushQueue(pushMockFn);
    onPushedQueue(pushMockFn);

    await untilCbCalled(setTimeout, 0);
    // static行为模式下不会进入队列，需异步检查
    expect(silentQueueMap.a10).toBeUndefined();

    expect(loading.value).toBeTruthy();
    expect(data.value).toBeUndefined();
    // 通过decorateSuccess将成功回调参数改为事件对象了，因此强转为此对象
    const scopedSQSuccessEvent = (await untilCbCalled(onSuccess)) as unknown as ScopedSQSuccessEvent<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >;
    expect(pushMockFn).toBeCalledTimes(0);
    expect(loading.value).toBeFalsy();
    expect(data.value).toStrictEqual({
      total: 300,
      list: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    });
    expect(error.value).toBeUndefined();
    expect(scopedSQSuccessEvent.behavior).toBe('static');
    expect(scopedSQSuccessEvent.data).toStrictEqual({
      total: 300,
      list: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    });
    expect(scopedSQSuccessEvent.sendArgs).toStrictEqual([]);
    expect(scopedSQSuccessEvent.method).not.toBeUndefined();
    expect(scopedSQSuccessEvent.silentMethod).toBeUndefined();
  });

  test('should be persisted when has no fallbackHandlers in silent behavior', async () => {
    const queue = 'tb6';
    const Get = () => alovaInst.Get<never>('/list');
    useSQRequest(Get, {
      behavior: () => 'silent',
      queue
    });

    await untilCbCalled(setTimeout, 0);
    expect(silentQueueMap[queue]).toHaveLength(1);
    let persistentSilentQueueMap = loadSilentQueueMapFromStorage();
    expect(persistentSilentQueueMap[queue]).toHaveLength(1);

    // 第二个请求
    const { onFallback } = useSQRequest(() => alovaInst.Get<any>('/list-error'), {
      behavior: () => 'silent',
      queue,
      retryError: /.*/,
      maxRetryTimes: 2
    });
    onFallback(event => {
      expect(event.behavior).toBe('silent');
      expect(event.method).not.toBeUndefined();
      expect(event.silentMethod).toBeInstanceOf(SilentMethod);
      expect(event.sendArgs).toStrictEqual([]);
    });

    await untilCbCalled(setTimeout, 0);
    expect(silentQueueMap[queue].length).toBe(2);
    persistentSilentQueueMap = loadSilentQueueMapFromStorage();
    expect(persistentSilentQueueMap[queue].length).toBe(1); // 绑定了onFallback时不会持久化
    await untilCbCalled(onFallback);
  });

  test('should be change behavior when param behavior set to a function that return different value', async () => {
    const queue = 'tb7';
    const poster = () => alovaInst.Post<any>('/detail');
    let behaviorStr: SQHookBehavior = 'silent';
    const { data, onSuccess, send } = useSQRequest(poster, {
      behavior: () => behaviorStr,
      queue
    });
    let event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(data.value).toBeInstanceOf(Undefined);
    expect(data.value[symbolVDataId]).not.toBeUndefined();
    expect(event.data).toBeInstanceOf(Undefined);
    expect(event.data[symbolVDataId]).not.toBeUndefined();
    expect(event.behavior).toBe('silent');
    expect(event.sendArgs).toStrictEqual([]);

    behaviorStr = 'static';
    send(1, 2, 3);
    event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(data.value).toStrictEqual({ id: 1 });
    expect(event.data).toStrictEqual({ id: 1 });
    expect(event.behavior).toBe('static');
    expect(event.sendArgs).toStrictEqual([1, 2, 3]);
  });

  test('should be intercpeted when has virtual data in method instance', async () => {
    const queue = 'tb8';
    const vDataId = createVirtualResponse(undefined);
    const poster = (id: number) => alovaInst.Post<any>('/detail', { id });
    const { data, onSuccess } = useSQRequest(() => poster(vDataId), {
      behavior: 'queue',
      queue,
      vDataCaptured(method) {
        expect(method.url).toBe('/detail');
        expect(method.type).toBe('POST');
        expect((method.requestBody as any).id).toBe(vDataId);
        return {
          localData: 'abc'
        };
      }
    });

    let event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(event.data).toStrictEqual({ localData: 'abc' });
    expect(data.value).toStrictEqual({ localData: 'abc' });

    // 第二：测试未设置vDataCaptured的情况，将发送请求
    const { data: data2, onSuccess: onSuccess2 } = useSQRequest(() => poster(vDataId), {
      behavior: 'queue',
      queue
    });
    event = (await untilCbCalled(onSuccess2)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(event.data).toStrictEqual({ id: 1 });
    expect(data2.value).toStrictEqual({ id: 1 });
  });

  test('should be intercpeted when has virtual data id string in method instance', async () => {
    const queue = 'tb9';
    const vDataId = createVirtualResponse(undefined);
    const poster = (id: number) =>
      alovaInst.Post<any>('/detail', {
        id: 'id is ' + stringifyVData(id)
      });
    const { data, onSuccess } = useSQRequest(() => poster(vDataId), {
      behavior: 'static', // vDataCaptured在任何行为模式下都有效
      queue,
      vDataCaptured() {
        return {
          localData: 'abc'
        };
      }
    });

    let event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(event.data).toStrictEqual({ localData: 'abc' });
    expect(data.value).toStrictEqual({ localData: 'abc' });
  });

  test('should be intercpeted when use virtual data to calculate in method instance', async () => {
    const queue = 'tb10';
    const vDataId = createVirtualResponse(undefined);
    const obj = { vDataId };

    const poster = (o: { vDataId: any }) =>
      alovaInst.Post<any>('/detail', {
        status: dehydrateVData(o.vDataId) ? 1 : 0
      });
    const { data, onSuccess } = useSQRequest(() => poster(obj), {
      behavior: 'queue',
      queue,
      vDataCaptured() {
        return {
          localData: 'abc'
        };
      }
    });

    let event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(event.data).toStrictEqual({ localData: 'abc' });
    expect(data.value).toStrictEqual({ localData: 'abc' });
  });

  test('the onSuccess should be emit immediately with virtualResponse, perhaps has default response', async () => {
    const queue = 'tb11';
    const poster = () => alovaInst.Post<any>('/detail');
    const { data, onSuccess } = useSQRequest(poster, {
      behavior: 'silent',
      queue
    });

    const event = (await untilCbCalled(onSuccess)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(event.behavior).toBe('silent');
    expect(event.method).not.toBeUndefined();
    expect(event.silentMethod).not.toBeUndefined();
    expect(event.sendArgs).toStrictEqual([]);
    expect(data.value[symbolVDataId]).toBeTruthy();
    expect(dehydrateVData(event.data)).toBeUndefined();
    expect(dehydrateVData(data.value)).toBeUndefined();

    const { data: data2, onSuccess: onSuccess2 } = useSQRequest(poster, {
      behavior: 'silent',
      queue,
      silentDefaultResponse: () => ({
        a: 1,
        b: 'bb'
      })
    });
    const event2 = (await untilCbCalled(onSuccess2)) as ScopedSQSuccessEvent<any, any, any, any, any, any, any>;
    expect(data2.value[symbolVDataId]).not.toBeUndefined();
    expect(data2.value.a.toFixed(2)).toBe('1.00');
    expect(data2.value.b.replace('b', 'a')).toBe('ab');

    expect(dehydrateVData(event2.data)).toStrictEqual({ a: 1, b: 'bb' });
    expect(dehydrateVData(data2.value)).toStrictEqual({ a: 1, b: 'bb' });
  });

  test('should be delay update states when call `updateStateEffect` in onSuccess handler', async () => {
    // 获取列表
    const queue = 'tb12';
    const getter = () => alovaInst.Get<any>('/info-list');
    const { data: listData, onSuccess } = useSQRequest(getter, {
      queue
    });
    await untilCbCalled(onSuccess);
    expect(listData.value).toStrictEqual([
      {
        id: 10,
        text: 'a'
      },
      {
        id: 20,
        text: 'b'
      },
      {
        id: 30,
        text: 'c'
      }
    ]);

    // 提交数据并立即更新
    const poster = () => alovaInst.Post<any>('/detail');
    const { data: postRes, onSuccess: onPostSuccess } = useSQRequest(poster, {
      behavior: 'silent',
      queue,
      silentDefaultResponse: () => ({
        id: '--'
      })
    });
    onPostSuccess(event => {
      const data = event.data;
      expect(postRes.value[symbolVDataId]).toBeTruthy(); // 此时还是虚拟响应数据

      // 调用updateStateEffect后将首先立即更新虚拟数据到listData中
      // 等到请求响应后再次更新实际数据到listData中
      const updated = updateStateEffect(getter(), listDataRaw => {
        listDataRaw.push({
          id: data.id,
          text: 'abc'
        });
        return listDataRaw;
      });
      expect(updated).toBeTruthy();

      const listDataLastItem = listData.value[listData.value.length - 1];
      expect(stringifyVData(listDataLastItem?.id)).toBe(stringifyVData(data.id));
      expect(dehydrateVData(listDataLastItem?.id)).toBe('--'); // 虚拟数据默认值
      expect(listDataLastItem?.text).toBe('abc');
    });

    await new Promise<void>(resolve => {
      onSilentSubmitSuccess(event => {
        if (event.queueName === queue) {
          resolve();
        }
      });
    });
    // 已替换为实际数据
    expect(postRes.value).toStrictEqual({ id: 1 });

    // listData也被替换为实际数据
    expect(listData.value).toStrictEqual([
      {
        id: 10,
        text: 'a'
      },
      {
        id: 20,
        text: 'b'
      },
      {
        id: 30,
        text: 'c'
      },
      {
        id: 1,
        text: 'abc'
      }
    ]);
  });

  test('should replace virtual data to real value that method instances after requesting method instance', async () => {
    // 提交数据并立即更新
    const queue = 'tb13';
    const poster = (data: Record<string, any>) => alovaInst.Post<any>('/detail2', data);
    const { onSuccess: onPostSuccess } = useSQRequest(
      () =>
        poster({
          text: 'aaa',
          status: 1
        }),
      {
        behavior: 'silent',
        queue,
        silentDefaultResponse() {
          return {
            id: null,
            text: null,
            status: null
          };
        }
      }
    );

    let vDataId: number | void;
    let vDataStatus: boolean | void;
    let vDataText: string | void;
    onPostSuccess(({ data }) => {
      vDataId = data.id;
      vDataStatus = data.status;
      vDataText = data.text;
    });

    await untilCbCalled(onPostSuccess);
    const { onSuccess: onPostSuccess2 } = useSQRequest(
      () =>
        poster({
          text: 'bbb',
          status: 2
        }),
      {
        behavior: 'silent',
        queue,
        silentDefaultResponse() {
          return {
            id: undefined,
            text: undefined,
            status: undefined
          };
        }
      }
    );

    let vDataId2: number | void;
    let vDataStatus2: boolean | void;
    let vDataText2: string | void;
    onPostSuccess2(({ data }) => {
      vDataId2 = data.id;
      vDataStatus2 = data.status;
      vDataText2 = data.text;
    });
    await untilCbCalled(onPostSuccess2);

    const deleter = () =>
      alovaInst.Delete<any>(`/detail/${stringifyVData(vDataId) + stringifyVData(vDataId2)}`, {
        text1: vDataText,
        text2: vDataText2,
        status: [vDataStatus, vDataStatus2]
      });
    const { onSuccess: onDeleteSuccess } = useSQRequest(deleter, {
      behavior: 'queue',
      queue
    });

    // 使用全局事件来检查上面的请求数据
    onSilentSubmitSuccess(event => {
      if (event.method.type === 'DELETE' && event.behavior === 'queue') {
        expect(event.method.url).toBe('/detail/1010');
        expect(event.method.requestBody).toStrictEqual({
          text1: 'aaa',
          text2: 'bbb',
          status: [1, 2]
        });
      }
    });

    const resRaw = await untilCbCalled(onDeleteSuccess);
    expect(resRaw.data).toStrictEqual({
      params: {
        id: '1010'
      },
      data: {
        text1: 'aaa',
        text2: 'bbb',
        status: [1, 2]
      }
    });
  });
});
