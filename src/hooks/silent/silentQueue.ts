import { Method, setCache, updateState, UpdateStateCollection } from 'alova';
import { RetryErrorDetailed, SilentQueueMap } from '../../../typings/general';
import {
  forEach,
  instanceOf,
  isObject,
  isString,
  len,
  newInstance,
  noop,
  objectKeys,
  promiseThen,
  pushItem,
  regexpTest,
  runArgsHandler,
  setTimeoutFn,
  shift,
  sloughConfig,
  walkObject
} from '../../helper';
import {
  behaviorSilent,
  defaultQueueName,
  falseValue,
  RegExpCls,
  trueValue,
  undefinedValue
} from '../../helper/variables';
import createSQEvent from './createSQEvent';
import {
  beforeHandlers,
  errorHandlers,
  failHandlers,
  queueRequestWaitSetting,
  setSilentFactoryStatus,
  silentFactoryStatus,
  successHandlers
} from './globalVariables';
import { SilentMethod } from './SilentMethod';
import {
  persistSilentMethod,
  push2PersistentSilentQueue,
  spliceStorageSilentMethod
} from './storage/silentMethodStorage';
import stringifyVData from './virtualResponse/stringifyVData';
import { regVDataId } from './virtualResponse/variables';

/** 静默方法队列集合 */
export let silentQueueMap = {} as SilentQueueMap;

/**
 * 合并queueMap到silentMethod队列集合
 * @param queueMap silentMethod队列集合
 */
export const merge2SilentQueueMap = (queueMap: SilentQueueMap) => {
  forEach(objectKeys(queueMap), targetQueueName => {
    const currentQueue = (silentQueueMap[targetQueueName] = silentQueueMap[targetQueueName] || []);
    pushItem(currentQueue, ...queueMap[targetQueueName]);
  });
};

/**
 * 清除silentQueue内所有项（测试使用）
 */
export const clearSilentQueueMap = () => (silentQueueMap = {});

/**
 * 深层遍历目标数据，并将虚拟数据替换为实际数据
 * @param target 目标数据
 * @param vDataResponse 虚拟数据和实际数据的集合
 * @returns 是否有替换数据
 */
export const deepReplaceVData = (target: any, vDataResponse: Record<string, any>) => {
  // 搜索单一值并将虚拟数据对象或虚拟数据id替换为实际值
  const replaceVData = (value: any) => {
    const vData = stringifyVData(value);
    // 如果直接是虚拟数据对象并且在vDataResponse中，则使用vDataResponse中的值替换Map
    // 如果是字符串，则里面可能包含虚拟数据id并且在vDataResponse中，也需将它替换为实际值Map
    // 不在本次vDataResponse中的虚拟数据将不变，它可能是下一次请求的虚拟数据Map
    if (vData in vDataResponse) {
      return vDataResponse[vData];
    } else if (isString(value)) {
      return value.replace(newInstance(RegExpCls, regVDataId.source, 'g'), mat =>
        mat in vDataResponse ? vDataResponse[mat] : mat
      );
    }
    return value;
  };
  if (isObject(target) && !stringifyVData(target, falseValue)) {
    walkObject(target, replaceVData);
  } else {
    target = replaceVData(target);
  }
  return target;
};

/**
 * 更新队列内的method实例，将虚拟数据替换为实际数据
 * @param vDataResponse 虚拟id和对应真实数据的集合
 * @param targetQueue 目标队列
 */
const updateQueueMethodEntities = (vDataResponse: Record<string, any>, targetQueue: SilentQueueMap[string]) => {
  forEach(targetQueue, silentMethodItem => {
    // 深层遍历entity对象，如果发现有虚拟数据或虚拟数据id，则替换为实际数据
    deepReplaceVData(silentMethodItem.entity, vDataResponse);
    // 如果method实例有更新，则重新持久化此silentMethod实例
    silentMethodItem.cache && persistSilentMethod(silentMethodItem);
  });
};

/**
 * 使用响应数据替换虚拟数据
 * @param response 真实响应数据
 * @param virtualResponse 虚拟响应数据
 * @returns 虚拟数据id所构成的对应真实数据集合
 */
const replaceVirtualResponseWithResponse = (virtualResponse: any, response: any) => {
  let vDataResponse = {} as Record<string, any>;
  const vDataId = stringifyVData(virtualResponse, falseValue);
  vDataId && (vDataResponse[vDataId] = response);

  if (isObject(virtualResponse)) {
    for (const i in virtualResponse) {
      vDataResponse = {
        ...vDataResponse,
        ...replaceVirtualResponseWithResponse(virtualResponse[i], response?.[i])
      };
    }
  }
  return vDataResponse;
};

/**
 * 启动SilentMethod队列
 * 1. 静默提交将会放入队列中，并按顺序发送请求，只有等到前一个请求响应后才继续发送后面的请求
 * 2. 重试次数只有在未响应时才触发，在服务端响应错误或断网情况下，不会重试
 * 3. 在达到重试次数仍未成功时，当设置了nextRound（下一轮）时延迟nextRound指定的时间后再次请求，否则将在刷新后再次尝试
 * 4. 如果有resolveHandler和rejectHandler，将在请求完成后（无论成功还是失败）调用，通知对应的请求继续响应
 *
 * @param queue SilentMethod队列
 */
const setSilentMethodActive = (silentMethodInstance: SilentMethod, active: boolean) => {
  if (active) {
    silentMethodInstance.active = active;
  } else {
    delete silentMethodInstance.active;
  }
};

const defaultBackoffDelay = 1000;
export const bootSilentQueue = (queue: SilentQueueMap[string], queueName: string) => {
  /**
   * 根据请求等待参数控制回调函数的调用，如果未设置或小于等于0则立即触发
   * @param queueName 队列名称
   * @param callback 回调函数
   */
  const emitWithRequestDelay = (queueName: string) => {
    const nextSilentMethod = queue[0];
    if (nextSilentMethod) {
      const targetSetting = queueRequestWaitSetting.find(({ queue }) =>
        instanceOf(queue, RegExpCls) ? regexpTest(queue, queueName) : queue === queueName
      );
      const callback = () => queue[0] && silentMethodRequest(queue[0]);
      const delay = targetSetting?.wait ? sloughConfig(targetSetting.wait, [nextSilentMethod, queueName]) : 0;
      delay && delay > 0 ? setTimeoutFn(callback, delay) : callback();
    }
  };

  /**
   * 运行单个silentMethod实例
   * @param silentMethodInstance silentMethod实例
   * @param retryTimes 重试的次数
   */
  const silentMethodRequest = (silentMethodInstance: SilentMethod, retryTimes = 0) => {
    // 将当前silentMethod实例设置活跃状态
    setSilentMethodActive(silentMethodInstance, trueValue);
    const {
      cache,
      id,
      behavior,
      entity,
      retryError = 0,
      maxRetryTimes = 0,
      backoff = { delay: defaultBackoffDelay },
      resolveHandler = noop,
      rejectHandler = noop,
      fallbackHandlers = [],
      retryHandlers = [],
      handlerArgs = [],
      virtualResponse
    } = silentMethodInstance;

    // 触发请求前事件
    runArgsHandler(beforeHandlers, createSQEvent(0, behavior, entity, silentMethodInstance, queueName, retryTimes));
    promiseThen(
      entity.send(),
      data => {
        // 请求成功，移除成功的silentMethod实力，并继续下一个请求
        shift(queue);
        // 请求成功，把成功的silentMethod实例在storage中移除，并继续下一个请求
        cache && spliceStorageSilentMethod(queueName, id);
        // 如果有resolveHandler则调用它通知外部
        resolveHandler(data);

        // 有virtualResponse时才遍历替换虚拟数据，且触发全局事件
        // 一般为silent behavior，而queue behavior不需要
        if (behavior === behaviorSilent) {
          // 替换队列中后面方法实例中的虚拟数据为真实数据
          // 开锁后才能正常访问virtualResponse的层级结构
          const vDataResponse = replaceVirtualResponseWithResponse(virtualResponse, data);
          const { targetRefMethod, updateStates } = silentMethodInstance; // 实时获取才准确
          // 如果此silentMethod带有targetRefMethod，则再次调用updateState更新数据
          // 此为延迟数据更新的实现
          if (instanceOf(targetRefMethod, Method) && updateStates && len(updateStates) > 0) {
            const updateStateCollection: UpdateStateCollection<any> = {};
            forEach(updateStates, stateName => {
              // 请求成功后，将带有虚拟数据的数据替换为实际数据
              updateStateCollection[stateName] = dataRaw => deepReplaceVData(dataRaw, vDataResponse);
            });
            const updated = updateState(targetRefMethod, updateStateCollection);

            // 修改状态不成功，则去修改缓存数据
            if (!updated) {
              setCache(targetRefMethod, (dataRaw: any) => deepReplaceVData(dataRaw, vDataResponse));
            }
          }

          // 对当前队列的后续silentMethod实例进行虚拟数据替换
          updateQueueMethodEntities(vDataResponse, queue);

          // 触发全局的成功事件
          runArgsHandler(
            successHandlers,
            createSQEvent(
              1,
              behavior,
              entity,
              silentMethodInstance,
              queueName,
              retryTimes,
              undefinedValue,
              undefinedValue,
              data,
              vDataResponse
            )
          );
        }

        // 设为非激活状态
        setSilentMethodActive(silentMethodInstance, falseValue);

        // 继续下一个silentMethod的处理
        emitWithRequestDelay(queueName);
      },
      reason => {
        if (behavior !== behaviorSilent) {
          // 当behavior不为silent时，请求失败就触发rejectHandler
          // 且在队列中移除，并不再重试
          shift(queue);
          rejectHandler(reason);
        } else {
          // 每次请求错误都将触发错误回调
          const runGlobalErrorEvent = (retryDelay?: number) =>
            runArgsHandler(
              errorHandlers,
              createSQEvent(
                2,
                behavior,
                entity,
                silentMethodInstance,
                queueName,
                retryTimes,
                retryDelay,
                undefinedValue,
                undefinedValue,
                undefinedValue,
                reason
              )
            );

          // 在silent行为模式下，判断是否需要重试
          // 重试只有在响应错误符合retryError正则匹配时有效
          const { name: errorName = '', message: errorMsg = '' } = reason || {};
          let regRetryErrorName: RegExp | void, regRetryErrorMsg: RegExp | void;
          if (instanceOf(retryError, RegExp)) {
            regRetryErrorMsg = retryError;
          } else if (isObject(retryError)) {
            regRetryErrorName = (retryError as RetryErrorDetailed).name;
            regRetryErrorMsg = (retryError as RetryErrorDetailed).message;
          }

          const matchRetryError =
            (regRetryErrorName && regexpTest(regRetryErrorName, errorName)) ||
            (regRetryErrorMsg && regexpTest(regRetryErrorMsg, errorMsg));
          // 如果还有重试次数则进行重试
          if (retryTimes < maxRetryTimes && matchRetryError) {
            let { delay = defaultBackoffDelay, multiplier = 1, startQuiver, endQuiver } = backoff;
            let retryDelayFinally = delay * Math.pow(multiplier, retryTimes);
            // 如果startQuiver或endQuiver有值，则需要增加指定范围的随机抖动值
            if (startQuiver || endQuiver) {
              startQuiver = startQuiver || 0;
              endQuiver = endQuiver || 1;
              retryDelayFinally +=
                retryDelayFinally * startQuiver + Math.random() * retryDelayFinally * (endQuiver - startQuiver);
              retryDelayFinally = Math.floor(retryDelayFinally); // 取整数延迟
            }

            runGlobalErrorEvent(retryDelayFinally);
            setTimeoutFn(
              () => {
                silentMethodRequest(silentMethodInstance, ++retryTimes);
                runArgsHandler(
                  retryHandlers,
                  createSQEvent(
                    8,
                    behavior,
                    entity,
                    silentMethodInstance,
                    undefinedValue,
                    retryTimes,
                    retryDelayFinally,
                    handlerArgs
                  )
                );
              },
              // 还有重试次数时使用timeout作为下次请求时间，否则是否nextRound
              retryDelayFinally
            );
          } else {
            setSilentFactoryStatus(2);
            runGlobalErrorEvent();
            // 达到失败次数，或不匹配重试的错误信息时，触发失败回调
            runArgsHandler(
              fallbackHandlers,
              createSQEvent(
                6,
                behavior,
                entity,
                silentMethodInstance,
                undefinedValue,
                undefinedValue,
                undefinedValue,
                handlerArgs,
                undefinedValue,
                undefinedValue,
                reason
              )
            );
            runArgsHandler(
              failHandlers,
              createSQEvent(
                3,
                behavior,
                entity,
                silentMethodInstance,
                queueName,
                retryTimes,
                undefinedValue,
                undefinedValue,
                undefinedValue,
                undefinedValue,
                reason
              )
            );
          }
        }
        // 设为非激活状态
        setSilentMethodActive(silentMethodInstance, falseValue);
      }
    );
  };
  emitWithRequestDelay(queueName);
};

/**
 * 将新的silentMethod实例放入队列中
 * @param methodInstance method实例
 * @param behavior 行为参数
 * @param fallbackHandlers 回退回调函数数组
 * @param retry 重试次数
 * @param timeout 请求超时时间，超时后将重试请求
 * @param nextRound 下一轮请求时间
 * @param resolveHandler promise.resolve函数
 * @param rejectHandler promise.reject函数
 * @param targetQueueName 目标队列名
 */
export const pushNewSilentMethod2Queue = <S, E, R, T, RC, RE, RH>(
  silentMethodInstance: SilentMethod<S, E, R, T, RC, RE, RH>,
  cache: boolean,
  targetQueueName = defaultQueueName,
  onBeforePush = noop
) => {
  silentMethodInstance.cache = cache;
  const currentQueue = (silentQueueMap[targetQueueName] = silentQueueMap[targetQueueName] || []);
  const isNewQueue = len(currentQueue) <= 0;
  const push2Queue = onBeforePush() as any;

  // silent行为下，如果没有绑定fallback事件回调，则持久化
  // 如果在onBeforePushQueue返回false，也不再放入队列中
  if (push2Queue !== falseValue) {
    cache && push2PersistentSilentQueue(silentMethodInstance, targetQueueName);
    pushItem(currentQueue, silentMethodInstance);
  }

  // 如果是新的队列且状态为已启动，则执行它
  isNewQueue && silentFactoryStatus === 1 && bootSilentQueue(currentQueue, targetQueueName);
};
