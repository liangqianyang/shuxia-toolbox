<template>
  <view class="lottery">
    <view class="lottery__brand">
      <view class="lottery__brand-mark">🍁</view>
      <view class="lottery__brand-copy">
        <text class="lottery__brand-kicker">枫叶小屋</text>
        <text class="lottery__brand-title">枫叶签筒</text>
      </view>
      <view class="lottery__brand-actions">
        <view class="lottery__text-btn" @tap="openHistory">记录</view>
        <view class="lottery__new" @tap="confirmReset">新建</view>
      </view>
    </view>

    <scroll-view class="lottery__step-scroll" scroll-x :show-scrollbar="false">
      <view class="lottery__steps">
        <view
          v-for="step in stepItems"
          :key="step.index"
          class="lottery__step"
          :class="{
            'lottery__step--active': activeStep === step.index,
            'lottery__step--ready': step.index <= maxStep,
          }"
          @tap="goStep(step.index)"
        >
          <view class="lottery__step-icon">{{ step.icon }}</view>
          <text class="lottery__step-label">{{ step.label }}</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="showHistory" class="lottery__screen">
      <view class="lottery__heading lottery__heading--row">
        <view>
          <text class="lottery__eyebrow">本机保留最近 20 条</text>
          <text class="lottery__title">活动记录</text>
        </view>
        <view v-if="historyItems.length" class="lottery__text-btn lottery__text-btn--danger" @tap="confirmClearHistory">清空</view>
      </view>

      <view v-if="historyItems.length" class="lottery__history-list">
        <view v-for="item in historyItems" :key="item.id" class="lottery__history-row">
          <view class="lottery__history-copy">
            <view class="lottery__history-title-row">
              <text class="lottery__history-name">{{ item.name }}</text>
              <text class="lottery__history-mode">{{ historyModeLabel(item.mode) }}</text>
            </view>
            <text class="lottery__history-meta">{{ formatHistoryTime(item.completedAt) }} · {{ item.summary }}</text>
            <text class="lottery__history-rule">{{ item.rules }}</text>
          </view>
          <view class="lottery__history-copy-btn" @tap="copyHistoryItem(item)">复制</view>
        </view>
      </view>
      <view v-else class="lottery__empty">
        <text class="lottery__empty-icon">🍁</text>
        <text>还没有完成的活动记录</text>
      </view>

      <view class="lottery__footer">
        <view class="lottery__primary-btn" @tap="closeHistory">返回活动</view>
      </view>
    </view>

    <view v-else-if="activeStep === 1" class="lottery__screen">
      <view class="lottery__heading">
        <text class="lottery__eyebrow">创建活动 · 1/3</text>
        <text class="lottery__title">活动设置</text>
      </view>

      <view class="lottery__field">
        <text class="lottery__label">活动名称</text>
        <input
          class="lottery__input"
          v-model="activityName"
          maxlength="30"
          placeholder="例如：七月团队茶话会"
        />
      </view>

      <view class="lottery__field">
        <view class="lottery__section-head">
          <text class="lottery__label">常用模板</text>
          <text class="lottery__section-note">选择后可继续调整</text>
        </view>
        <view class="lottery__template-grid">
          <view
            v-for="item in templateItems"
            :key="item.id"
            class="lottery__template"
            :class="{ 'lottery__template--active': selectedTemplateId === item.id }"
            @tap="applyTemplate(item.id)"
          >
            <text class="lottery__template-icon">{{ item.icon }}</text>
            <text class="lottery__template-label">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view class="lottery__field">
        <text class="lottery__label">玩法</text>
        <view class="lottery__mode-grid">
          <view
            v-for="item in modeItems"
            :key="item.id"
            class="lottery__mode"
            :class="{ 'lottery__mode--active': mode === item.id }"
            @tap="setMode(item.id)"
          >
            <text class="lottery__mode-icon">{{ item.icon }}</text>
            <text class="lottery__mode-name">{{ item.label }}</text>
            <text class="lottery__mode-hint">{{ item.hint }}</text>
          </view>
        </view>
      </view>

      <view class="lottery__field">
        <text class="lottery__label">活动性质</text>
        <view class="lottery__segment">
          <view
            class="lottery__segment-item"
            :class="{ 'lottery__segment-item--active': nature === 'public' }"
            @tap="setNature('public')"
          >公开抽取</view>
          <view
            class="lottery__segment-item"
            :class="{ 'lottery__segment-item--active': nature === 'internal' }"
            @tap="setNature('internal')"
          >内部活动</view>
        </view>
      </view>

      <view v-if="mode === 'prize'" class="lottery__switch-row">
        <view class="lottery__switch-copy">
          <text class="lottery__switch-title">包含特别赠礼</text>
          <text class="lottery__switch-hint">预留奖品并指定获赠人，可设置多条</text>
        </view>
        <switch
          :checked="allowSpecialGifts"
          :disabled="nature === 'public'"
          color="#c64f3d"
          @change="onSpecialToggle"
        />
      </view>
      <text v-if="mode === 'prize' && nature === 'public'" class="lottery__notice">
        公开抽取模式只保留随机规则，开始后会锁定奖品与名单。
      </text>

      <view class="lottery__footer">
        <view class="lottery__secondary-btn" @tap="confirmReset">清空</view>
        <view class="lottery__primary-btn" @tap="nextFromSetup">
          <text>{{ setupNextLabel }}</text><text>→</text>
        </view>
      </view>
    </view>

    <view v-else-if="activeStep === 2" class="lottery__screen">
      <view class="lottery__heading lottery__heading--row">
        <view>
          <text class="lottery__eyebrow">创建活动 · 2/3</text>
          <text class="lottery__title">{{ contentTitle }}</text>
        </view>
        <view v-if="mode === 'prize'" class="lottery__compact-btn" @tap="addPrize">＋ 奖品</view>
      </view>

      <template v-if="mode === 'prize'">
        <view class="lottery__advanced">
          <view class="lottery__advanced-head" @tap="togglePrizeAdvanced">
            <view>
              <text class="lottery__switch-title">高级开奖规则</text>
              <text class="lottery__switch-hint">{{ prizeDrawStrategy === 'weighted' ? '当前：混合奖池权重' : '当前：按奖项逐轮' }}</text>
            </view>
            <text class="lottery__advanced-arrow">{{ showPrizeAdvanced ? '⌃' : '⌄' }}</text>
          </view>
          <view v-if="showPrizeAdvanced" class="lottery__advanced-content">
            <view class="lottery__segment">
              <view
                class="lottery__segment-item"
                :class="{ 'lottery__segment-item--active': prizeDrawStrategy === 'by-prize' }"
                @tap="setPrizeDrawStrategy('by-prize')"
              >按奖项逐轮</view>
              <view
                class="lottery__segment-item"
                :class="{ 'lottery__segment-item--active': prizeDrawStrategy === 'weighted' }"
                @tap="setPrizeDrawStrategy('weighted')"
              >混合奖池权重</view>
            </view>
            <text class="lottery__section-note">
              {{ prizeDrawStrategy === 'by-prize' ? '按奖品列表从下往上开奖，例如三等奖 → 二等奖 → 一等奖' : '每轮从全部剩余随机奖品中按库存和权重抽取' }}
            </text>
          </view>
        </view>

        <view class="lottery__section-head">
          <text class="lottery__section-title">奖品池</text>
          <text class="lottery__section-note">{{ prizeDrawStrategy === 'weighted' ? '库存 × 权重决定概率' : '列表越靠上，开奖越靠后' }}</text>
        </view>

        <view class="lottery__list">
          <view v-for="(prize, index) in prizes" :key="prize.id" class="lottery__prize-row">
            <view class="lottery__prize-top">
              <view class="lottery__prize-index">{{ index + 1 }}</view>
              <input
                class="lottery__inline-input"
                v-model="prize.name"
                maxlength="20"
                placeholder="奖品名称"
              />
              <view class="lottery__icon-btn" @tap="removePrize(prize.id)">×</view>
            </view>
            <view class="lottery__prize-controls" :class="{ 'lottery__prize-controls--simple': prizeDrawStrategy === 'by-prize' }">
              <view class="lottery__control-block">
                <text class="lottery__control-label">库存</text>
                <view class="lottery__stepper">
                  <view class="lottery__stepper-btn" @tap="changePrizeQuantity(prize, -1)">−</view>
                  <text class="lottery__stepper-value">{{ prize.quantity }}</text>
                  <view class="lottery__stepper-btn" @tap="changePrizeQuantity(prize, 1)">＋</view>
                </view>
              </view>
              <view v-if="prizeDrawStrategy === 'weighted'" class="lottery__control-block">
                <text class="lottery__control-label">权重</text>
                <view class="lottery__stepper">
                  <view class="lottery__stepper-btn" @tap="changePrizeWeight(prize, -1)">−</view>
                  <text class="lottery__stepper-value">{{ prize.weight }}</text>
                  <view class="lottery__stepper-btn" @tap="changePrizeWeight(prize, 1)">＋</view>
                </view>
              </view>
              <view v-if="prizeDrawStrategy === 'weighted'" class="lottery__probability">
                <text class="lottery__probability-value">{{ formatProbability(prize.id) }}</text>
                <text class="lottery__control-label">随机概率</text>
              </view>
            </view>
            <view v-if="reservedForPrize(prize.id) > 0" class="lottery__reserved-note">
              已为特别赠礼预留 {{ reservedForPrize(prize.id) }} 份
            </view>
          </view>
        </view>

        <view v-if="showSpecialGiftEditor" class="lottery__gift-section">
          <view class="lottery__section-head">
            <view>
              <text class="lottery__section-title">特别赠礼</text>
              <text class="lottery__section-note">{{ specialGiftSummary }}</text>
            </view>
            <view class="lottery__compact-btn" @tap="addSpecialGift">＋ 新增</view>
          </view>

          <view v-if="specialGifts.length === 0" class="lottery__empty">
            <text class="lottery__empty-icon">🍁</text>
            <text>还没有特别赠礼</text>
          </view>

          <view v-for="(gift, index) in specialGifts" :key="gift.id" class="lottery__gift-rule">
            <view class="lottery__gift-head">
              <text class="lottery__gift-title">赠礼 {{ index + 1 }}</text>
              <view class="lottery__icon-btn" @tap="removeSpecialGift(gift.id)">×</view>
            </view>
            <view class="lottery__gift-grid">
              <view class="lottery__field lottery__field--compact">
                <text class="lottery__control-label">奖品</text>
                <picker :range="prizePickerOptions" range-key="label" :value="giftPrizeIndex(gift)" @change="onGiftPrizeChange(gift, $event)">
                  <view class="lottery__picker">{{ prizeName(gift.prizeId) || '请选择奖品' }}⌄</view>
                </picker>
              </view>
              <view class="lottery__field lottery__field--compact">
                <text class="lottery__control-label">数量</text>
                <view class="lottery__stepper lottery__stepper--wide">
                  <view class="lottery__stepper-btn" @tap="changeGiftQuantity(gift, -1)">−</view>
                  <text class="lottery__stepper-value">{{ gift.quantity }}</text>
                  <view class="lottery__stepper-btn" @tap="changeGiftQuantity(gift, 1)">＋</view>
                </view>
              </view>
            </view>
            <view class="lottery__gift-target-preview">
              <text class="lottery__control-label">赠送对象</text>
              <text class="lottery__gift-target-text">
                {{ gift.recipient ? `已选：${gift.recipient}` : '下一步从参与名单中选择' }}
              </text>
            </view>
          </view>

          <view v-if="specialGiftErrors.length" class="lottery__error-list">
            <text v-for="error in specialGiftErrors" :key="error" class="lottery__error">{{ error }}</text>
          </view>
        </view>
      </template>

      <template v-else-if="mode === 'random'">
        <view class="lottery__field">
          <view class="lottery__section-head">
            <text class="lottery__label">候选内容</text>
            <view class="lottery__section-action">
              <text class="lottery__section-note">{{ randomParsedOptions.length }} 个选项</text>
              <view class="lottery__compact-btn" @tap="appendClipboard('random')">粘贴</view>
            </view>
          </view>
          <textarea
            class="lottery__textarea lottery__textarea--large"
            v-model="randomOptionText"
            maxlength="5000"
            placeholder="每行一个选项，可以是姓名、任务、地点或任何内容"
          />
          <text v-if="randomDuplicateOptions.length" class="lottery__duplicate-note">已自动合并重复项：{{ formatDuplicateNames(randomDuplicateOptions) }}</text>
        </view>
      </template>

      <template v-else>
        <view class="lottery__field">
          <view class="lottery__section-head">
            <text class="lottery__label">参与名单</text>
            <view class="lottery__section-action">
              <text class="lottery__section-note">{{ teamParticipants.length }} 人</text>
              <view class="lottery__compact-btn" @tap="appendClipboard('team')">粘贴</view>
            </view>
          </view>
          <textarea
            class="lottery__textarea lottery__textarea--large"
            v-model="teamParticipantText"
            maxlength="5000"
            placeholder="每行一个名字"
          />
          <text v-if="teamDuplicateNames.length" class="lottery__duplicate-note">已自动合并重复姓名：{{ formatDuplicateNames(teamDuplicateNames) }}</text>
        </view>
      </template>

      <view class="lottery__footer">
        <view class="lottery__secondary-btn" @tap="goStep(1)">← 上一步</view>
        <view class="lottery__primary-btn" @tap="nextFromContent">
          <text>{{ contentNextLabel }}</text><text>→</text>
        </view>
      </view>
    </view>

    <view v-else-if="activeStep === 3" class="lottery__screen">
      <view class="lottery__heading">
        <text class="lottery__eyebrow">创建活动 · 3/3</text>
        <text class="lottery__title">{{ rulesTitle }}</text>
      </view>

      <template v-if="mode === 'prize'">
        <view class="lottery__field">
          <view class="lottery__section-head">
            <text class="lottery__label">参与者</text>
            <view class="lottery__section-action">
              <text class="lottery__section-note">{{ prizeParticipants.length }} 人</text>
              <view class="lottery__compact-btn" @tap="appendClipboard('prize')">粘贴</view>
            </view>
          </view>
          <textarea
            class="lottery__textarea lottery__textarea--large"
            v-model="prizeParticipantText"
            maxlength="5000"
            placeholder="每行一个名字，可直接粘贴名单"
          />
          <text v-if="prizeDuplicateNames.length" class="lottery__duplicate-note">已自动合并重复姓名：{{ formatDuplicateNames(prizeDuplicateNames) }}</text>
        </view>
        <view v-if="showSpecialGiftEditor && specialGifts.length" class="lottery__gift-assignment">
          <view class="lottery__section-head">
            <view>
              <text class="lottery__section-title">特别赠礼对象</text>
              <text class="lottery__section-note">只能从上方参与名单中选择</text>
            </view>
          </view>
          <view v-if="prizeParticipants.length === 0" class="lottery__notice">
            请先填写参与名单，再为特别赠礼选择对象。
          </view>
          <view v-for="(gift, index) in specialGifts" :key="gift.id" class="lottery__assignment-row">
            <view class="lottery__assignment-copy">
              <text class="lottery__gift-title">赠礼 {{ index + 1 }}</text>
              <text class="lottery__section-note">{{ prizeName(gift.prizeId) }} × {{ gift.quantity }}</text>
            </view>
            <picker
              class="lottery__assignment-picker-wrap"
              :disabled="prizeParticipants.length === 0"
              :range="prizeParticipants"
              :value="giftRecipientIndex(gift)"
              @change="onGiftRecipientChange(gift, $event)"
            >
              <view
                class="lottery__picker lottery__picker--assignment"
                :class="{ 'lottery__picker--invalid': gift.recipient && !isGiftRecipientValid(gift) }"
              >
                {{ giftRecipientLabel(gift) }}⌄
              </view>
            </picker>
          </view>
          <view v-if="specialGiftAssignmentErrors.length" class="lottery__error-list">
            <text v-for="error in specialGiftAssignmentErrors" :key="error" class="lottery__error">{{ error }}</text>
          </view>
        </view>
        <view class="lottery__switch-row">
          <view class="lottery__switch-copy">
            <text class="lottery__switch-title">不重复中奖</text>
            <text class="lottery__switch-hint">特别赠礼对象也会计入已中奖名单</text>
          </view>
          <switch :checked="prizeNoRepeat" color="#c64f3d" @change="onPrizeNoRepeatChange" />
        </view>
      </template>

      <template v-else-if="mode === 'random'">
        <view class="lottery__rule-row">
          <view>
            <text class="lottery__switch-title">每轮抽取</text>
            <text class="lottery__switch-hint">最多不超过候选数量</text>
          </view>
          <view class="lottery__stepper">
            <view class="lottery__stepper-btn" @tap="changeRandomDrawCount(-1)">−</view>
            <text class="lottery__stepper-value">{{ randomDrawCount }}</text>
            <view class="lottery__stepper-btn" @tap="changeRandomDrawCount(1)">＋</view>
          </view>
        </view>
        <view class="lottery__switch-row">
          <view class="lottery__switch-copy">
            <text class="lottery__switch-title">抽中后不放回</text>
            <text class="lottery__switch-hint">后续轮次不会再次抽中相同选项</text>
          </view>
          <switch :checked="randomNoReplacement" color="#c64f3d" @change="onRandomReplacementChange" />
        </view>
        <view class="lottery__switch-row">
          <view class="lottery__switch-copy">
            <text class="lottery__switch-title">设置选项权重</text>
            <text class="lottery__switch-hint">权重越高，被抽中的机会越大</text>
          </view>
          <switch :checked="randomUseWeights" color="#c64f3d" @change="onRandomWeightToggle" />
        </view>
        <view v-if="randomUseWeights" class="lottery__weight-list">
          <view v-for="option in randomOptions" :key="option.id" class="lottery__weight-row">
            <text class="lottery__weight-name">{{ option.label }}</text>
            <view class="lottery__stepper">
              <view class="lottery__stepper-btn" @tap="changeRandomWeight(option.label, -1)">−</view>
              <text class="lottery__stepper-value">{{ option.weight }}</text>
              <view class="lottery__stepper-btn" @tap="changeRandomWeight(option.label, 1)">＋</view>
            </view>
          </view>
        </view>
      </template>

      <template v-else>
        <view class="lottery__rule-row">
          <view>
            <text class="lottery__switch-title">分组数量</text>
            <text class="lottery__switch-hint">自动保持各组人数尽量一致</text>
          </view>
          <view class="lottery__stepper">
            <view class="lottery__stepper-btn" @tap="changeTeamCount(-1)">−</view>
            <text class="lottery__stepper-value">{{ teamGroupCount }}</text>
            <view class="lottery__stepper-btn" @tap="changeTeamCount(1)">＋</view>
          </view>
        </view>
        <view class="lottery__field">
          <text class="lottery__label">分组名称</text>
          <input
            class="lottery__input"
            v-model="teamGroupNamesText"
            maxlength="100"
            placeholder="用逗号分隔，例如：枫叶组，银杏组"
          />
        </view>
        <view class="lottery__summary-band">
          <text>预计分组</text>
          <text>{{ teamGroupCount }} 组 · 每组约 {{ estimatedTeamSize }} 人</text>
        </view>
      </template>

      <view class="lottery__footer">
        <view class="lottery__secondary-btn" @tap="goStep(2)">← 上一步</view>
        <view class="lottery__primary-btn" @tap="startActivity">
          <text>锁定并开始</text><text>→</text>
        </view>
      </view>
    </view>

    <view v-else-if="activeStep === 4" class="lottery__screen lottery__screen--draw">
      <view class="lottery__draw-head">
        <text class="lottery__draw-badge">{{ modeLabel }}</text>
        <text class="lottery__title">{{ activityName || '未命名活动' }}</text>
        <text class="lottery__eyebrow">规则已锁定 · {{ drawProgressText }}</text>
      </view>

      <view v-if="mode === 'prize'" class="lottery__field">
        <view class="lottery__section-head">
          <text class="lottery__label">当前奖项</text>
          <text class="lottery__section-note">{{ prizeDrawStrategy === 'by-prize' ? '会在本奖项抽完后自动进入下一轮' : '可手动切换抽取规则' }}</text>
        </view>
        <picker :range="prizeRoundOptions" range-key="label" :value="selectedRoundIndex" @change="onRoundChange">
          <view class="lottery__picker lottery__picker--strong">{{ currentRoundLabel }}⌄</view>
        </picker>
      </view>
      <view v-if="mode === 'prize' && currentRoundSummary" class="lottery__round-summary">
        {{ currentRoundSummary }}
      </view>
      <view v-if="showPrizeRoundCount" class="lottery__rule-row">
        <view>
          <text class="lottery__switch-title">本轮抽取</text>
          <text class="lottery__switch-hint">本奖项本轮最多可抽 {{ currentRoundRandomCapacity }} 人</text>
        </view>
        <view class="lottery__stepper">
          <view class="lottery__stepper-btn" @tap="changePrizeRoundDrawCount(-1)">−</view>
          <text class="lottery__stepper-value">{{ prizeRoundDrawCount }}</text>
          <view class="lottery__stepper-btn" @tap="changePrizeRoundDrawCount(1)">＋</view>
        </view>
      </view>

      <view class="lottery__draw-stage" :class="{ 'lottery__draw-stage--running': drawing }">
        <text class="lottery__falling-leaf lottery__falling-leaf--one">🍁</text>
        <text class="lottery__falling-leaf lottery__falling-leaf--two">🍁</text>
        <text class="lottery__falling-leaf lottery__falling-leaf--three">🍁</text>
        <view class="lottery__sticks">
          <text>枫</text><text>叶</text><text>签</text><text>筒</text><text>🍁</text>
        </view>
        <view class="lottery__tube">
          <text class="lottery__tube-leaf">🍁</text>
          <text class="lottery__tube-name">枫叶签筒</text>
        </view>
        <text class="lottery__rolling">{{ rollingText }}</text>
        <text class="lottery__draw-hint">{{ drawHint }}</text>
      </view>

      <view
        class="lottery__primary-btn lottery__primary-btn--full"
        :class="{ 'lottery__primary-btn--disabled': drawing || !canDraw }"
        @tap="performDraw"
      >
        <text>{{ drawButtonLabel }}</text>
      </view>
      <view class="lottery__secondary-btn lottery__secondary-btn--full" @tap="goStep(3)">返回修改规则</view>
    </view>

    <view v-else class="lottery__screen lottery__screen--result">
      <view class="lottery__result-leaves"><text>🍁</text><text>🍁</text><text>🍁</text></view>
      <view class="lottery__result-hero">
        <text class="lottery__draw-badge">{{ latestResultBadge }}</text>
        <text class="lottery__result-kicker">{{ latestResultKicker }}</text>
        <text class="lottery__result-main">{{ latestResultMain }}</text>
        <text class="lottery__result-detail">{{ latestResultDetail }}</text>
      </view>

      <view v-if="mode === 'prize'" class="lottery__result-list">
        <view v-for="(award, index) in awards" :key="award.id" class="lottery__result-row">
          <text class="lottery__result-index">{{ padNumber(index + 1) }}</text>
          <view class="lottery__result-copy">
            <text class="lottery__result-name">{{ award.recipient }}</text>
            <text class="lottery__result-sub">{{ award.prizeName }} × {{ award.quantity }}</text>
          </view>
          <text class="lottery__source" :class="{ 'lottery__source--special': award.source === 'special' }">
            {{ award.source === 'special' ? '特别赠礼' : '随机抽中' }}
          </text>
        </view>
      </view>

      <view v-else-if="mode === 'random'" class="lottery__result-list">
        <view v-for="(result, index) in optionResults" :key="result.id" class="lottery__result-row">
          <text class="lottery__result-index">{{ padNumber(index + 1) }}</text>
          <text class="lottery__result-name lottery__result-name--wide">{{ result.label }}</text>
        </view>
      </view>

      <view v-else class="lottery__groups">
        <view v-for="group in teamResults" :key="group.id" class="lottery__group">
          <view class="lottery__group-head">
            <text class="lottery__group-name">{{ group.name }}</text>
            <text class="lottery__section-note">{{ group.members.length }} 人</text>
          </view>
          <view class="lottery__group-members">
            <text v-for="member in group.members" :key="member">{{ member }}</text>
          </view>
        </view>
      </view>

      <view class="lottery__footer lottery__footer--result">
        <view v-if="mode !== 'team' && canDraw" class="lottery__secondary-btn" @tap="continueDrawing">{{ continueDrawLabel }}</view>
        <view class="lottery__primary-btn" @tap="finishActivity">完成活动</view>
      </view>
      <view class="lottery__copy-btn" @tap="copyResults">复制结果</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  LotteryAward,
  LotteryHistoryItem,
  LotteryMode,
  LotteryNature,
  LotteryOption,
  LotteryOptionResult,
  LotteryPrize,
  LotterySpecialGift,
  LotteryTeamResult,
} from '@/types/lottery'
import {
  calculatePrizePool,
  createBalancedGroups,
  drawWeightedOptions,
  findDuplicateLotteryLines,
  parseLotteryLines,
  pickRandom,
  pickWeighted,
  validateSpecialGifts,
} from '@/utils/lottery'

type PickerEvent = { detail: { value: string } }
type SwitchEvent = { detail: { value: boolean } }
type PrizeDrawStrategy = 'by-prize' | 'weighted'
type ClipboardTarget = 'prize' | 'random' | 'team'
type LotteryTemplateId = 'food' | 'outing' | 'captain' | 'annual' | 'team'

interface PrizePickerOption {
  id: string
  label: string
}

interface PrizeRoundOption {
  id: string
  label: string
  type: 'prize' | 'weighted' | 'special-prize'
  prizeId?: string
}

interface LotteryTemplateItem {
  id: LotteryTemplateId
  label: string
  icon: string
}

interface LotteryDraft {
  activityName: string
  mode: LotteryMode
  nature: LotteryNature
  prizeDrawStrategy: PrizeDrawStrategy
  allowSpecialGifts: boolean
  prizes: LotteryPrize[]
  specialGifts: LotterySpecialGift[]
  prizeParticipantText: string
  prizeNoRepeat: boolean
  prizeRoundDrawCount: number
  randomOptionText: string
  randomDrawCount: number
  randomNoReplacement: boolean
  randomUseWeights: boolean
  randomWeightMap: Record<string, number>
  teamParticipantText: string
  teamGroupCount: number
  teamGroupNamesText: string
  awards: LotteryAward[]
  optionResults: LotteryOptionResult[]
  teamResults: LotteryTeamResult[]
  activeStep: number
  maxStep: number
}

const DRAFT_KEY = 'shuxia_lottery_draft_v1'
const HISTORY_KEY = 'shuxia_lottery_history_v1'
const MAPLE_GROUP_NAMES = ['枫叶组', '银杏组', '青竹组', '山茶组', '松果组', '流云组', '星河组', '朝露组']

const modeItems: Array<{ id: LotteryMode; label: string; hint: string; icon: string }> = [
  { id: 'prize', label: '奖品抽奖', hint: '权重与特别赠礼', icon: '🎁' },
  { id: 'random', label: '随机抽取', hint: '任意候选内容', icon: '↝' },
  { id: 'team', label: '随机分组', hint: '均衡分配名单', icon: '⌘' },
]

const templateItems: LotteryTemplateItem[] = [
  { id: 'food', label: '今天吃什么', icon: '🍜' },
  { id: 'outing', label: '今天去哪玩', icon: '🗺' },
  { id: 'captain', label: '抽队长', icon: '✦' },
  { id: 'annual', label: '年会抽奖', icon: '🎉' },
  { id: 'team', label: '随机分组', icon: '⌘' },
]

let idSeed = 0
function makeId(prefix: string): string {
  idSeed += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeed.toString(36)}`
}

function defaultPrizes(): LotteryPrize[] {
  return [
    { id: makeId('prize'), name: '一等奖', quantity: 1, weight: 1 },
    { id: makeId('prize'), name: '二等奖', quantity: 2, weight: 1 },
    { id: makeId('prize'), name: '三等奖', quantity: 3, weight: 1 },
  ]
}

const activeStep = ref(1)
const maxStep = ref(1)
const activityName = ref('我的抽奖活动')
const mode = ref<LotteryMode>('prize')
const nature = ref<LotteryNature>('internal')
const prizeDrawStrategy = ref<PrizeDrawStrategy>('by-prize')
const allowSpecialGifts = ref(true)
const prizes = ref<LotteryPrize[]>(defaultPrizes())
const specialGifts = ref<LotterySpecialGift[]>([])
const prizeParticipantText = ref('')
const prizeNoRepeat = ref(true)
const prizeRoundDrawCount = ref(1)
const randomOptionText = ref('')
const randomDrawCount = ref(1)
const randomNoReplacement = ref(true)
const randomUseWeights = ref(false)
const randomWeightMap = ref<Record<string, number>>({})
const teamParticipantText = ref('')
const teamGroupCount = ref(2)
const teamGroupNamesText = ref('枫叶组，银杏组')
const awards = ref<LotteryAward[]>([])
const optionResults = ref<LotteryOptionResult[]>([])
const teamResults = ref<LotteryTeamResult[]>([])
const selectedRoundId = ref('')
const drawing = ref(false)
const rollingText = ref('准备开奖')
const lastRandomBatch = ref<LotteryOptionResult[]>([])
const lastAwardBatch = ref<LotteryAward[]>([])
const selectedTemplateId = ref<LotteryTemplateId | null>(null)
const showPrizeAdvanced = ref(false)
const showHistory = ref(false)
const historyItems = ref<LotteryHistoryItem[]>([])
const batchRevealIndex = ref(0)
const batchRevealTotal = ref(0)
let drawTimer: ReturnType<typeof setInterval> | null = null
let revealTimer: ReturnType<typeof setTimeout> | null = null
let draftReady = false

const modeLabel = computed(() => modeItems.find((item) => item.id === mode.value)?.label ?? '随机抽取')
const stepItems = computed(() => [
  { index: 1, label: '设置', icon: '⚙' },
  { index: 2, label: mode.value === 'prize' ? '奖品' : mode.value === 'random' ? '签池' : '名单', icon: mode.value === 'prize' ? '🎁' : '▦' },
  { index: 3, label: mode.value === 'prize' ? '名单' : mode.value === 'random' ? '规则' : '分组', icon: mode.value === 'prize' ? '♙' : '⌘' },
  { index: 4, label: '开奖', icon: '✦' },
  { index: 5, label: '结果', icon: '✓' },
])
const setupNextLabel = computed(() => mode.value === 'prize' ? '设置奖品' : mode.value === 'random' ? '设置签池' : '添加名单')
const contentTitle = computed(() => mode.value === 'prize' ? '奖品设置' : mode.value === 'random' ? '候选签池' : '参与名单')
const contentNextLabel = computed(() => mode.value === 'prize' ? '添加名单' : mode.value === 'random' ? '设置规则' : '设置分组')
const rulesTitle = computed(() => mode.value === 'prize' ? '参与名单' : mode.value === 'random' ? '抽取规则' : '分组规则')
const showSpecialGiftEditor = computed(() => nature.value === 'internal' && allowSpecialGifts.value)
const activeSpecialGifts = computed(() => showSpecialGiftEditor.value ? specialGifts.value : [])
const specialGiftValidation = computed(() => validateSpecialGifts(prizes.value, activeSpecialGifts.value, { requireRecipient: false }))
const specialGiftErrors = computed(() => specialGiftValidation.value.errors)
const specialGiftSummary = computed(() => {
  const quantity = activeSpecialGifts.value.reduce((sum, gift) => sum + gift.quantity, 0)
  return specialGifts.value.length ? `${specialGifts.value.length} 项 · 共预留 ${quantity} 份` : '可添加多条赠礼规则'
})
const awardedByPrize = computed(() => {
  const counts: Record<string, number> = {}
  for (const award of awards.value) {
    if (award.source !== 'random') continue
    counts[award.prizeId] = (counts[award.prizeId] ?? 0) + award.quantity
  }
  return counts
})
const prizePool = computed(() => calculatePrizePool(prizes.value, activeSpecialGifts.value, awardedByPrize.value))
const prizePickerOptions = computed<PrizePickerOption[]>(() => prizes.value.map((prize) => ({ id: prize.id, label: `${prize.name || '未命名奖品'}（库存 ${prize.quantity}）` })))
const prizeParticipants = computed(() => parseLotteryLines(prizeParticipantText.value))
const specialGiftAssignmentErrors = computed(() => {
  if (!showSpecialGiftEditor.value) return []
  const participantNames = new Set(prizeParticipants.value.map(normalizeName))
  const assignedNames = new Set<string>()
  const errors: string[] = []
  specialGifts.value.forEach((gift, index) => {
    const recipient = gift.recipient.trim()
    if (!recipient) {
      errors.push(`赠礼 ${index + 1} 还没有选择对象`)
      return
    }
    const key = normalizeName(recipient)
    if (!participantNames.has(key)) {
      errors.push(`赠礼 ${index + 1} 的对象“${recipient}”不在参与名单中`)
      return
    }
    if (prizeNoRepeat.value && assignedNames.has(key)) {
      errors.push(`“${recipient}”被重复指定了特别赠礼`)
      return
    }
    assignedNames.add(key)
  })
  return errors
})
const randomParsedOptions = computed(() => parseLotteryLines(randomOptionText.value))
const randomDuplicateOptions = computed(() => findDuplicateLotteryLines(randomOptionText.value))
const randomOptions = computed<LotteryOption[]>(() => randomParsedOptions.value.map((label, index) => ({
  id: `option-${index}-${label}`,
  label,
  weight: randomUseWeights.value ? Math.max(1, randomWeightMap.value[label] ?? 1) : 1,
})))
const teamParticipants = computed(() => parseLotteryLines(teamParticipantText.value))
const teamDuplicateNames = computed(() => findDuplicateLotteryLines(teamParticipantText.value))
const prizeDuplicateNames = computed(() => findDuplicateLotteryLines(prizeParticipantText.value))
const estimatedTeamSize = computed(() => teamParticipants.value.length ? Math.ceil(teamParticipants.value.length / Math.max(1, teamGroupCount.value)) : 0)
const drawnSpecialGiftIds = computed(() => new Set(awards.value.filter((award) => award.source === 'special').map((award) => award.specialGiftId)))
const prizeRoundOptions = computed<PrizeRoundOption[]>(() => {
  const options: PrizeRoundOption[] = []
  if (prizeDrawStrategy.value === 'weighted') {
    if (prizePool.value.some((item) => item.remaining > 0) && eligiblePrizeParticipants().length > 0) {
      options.push({ id: 'weighted', label: '混合奖池按权重抽取', type: 'weighted' })
    }
    for (const prize of [...prizes.value].reverse()) {
      const gifts = pendingSpecialGiftsForPrize(prize.id)
      if (!gifts.length) continue
      const quantity = gifts.reduce((sum, gift) => sum + gift.quantity, 0)
      options.push({
        id: `special-prize:${prize.id}`,
        label: `${prize.name || '未命名奖品'}（特别赠礼 ${quantity} 份）`,
        type: 'special-prize',
        prizeId: prize.id,
      })
    }
    return options
  }

  const hasEligibleParticipant = eligiblePrizeParticipants().length > 0
  for (const prize of [...prizes.value].reverse()) {
    const randomRemaining = randomRemainingForPrize(prize.id)
    const gifts = pendingSpecialGiftsForPrize(prize.id)
    const giftQuantity = gifts.reduce((sum, gift) => sum + gift.quantity, 0)
    const drawableRandom = hasEligibleParticipant ? randomRemaining : 0
    if (drawableRandom + giftQuantity <= 0) continue
    options.push({
      id: `prize:${prize.id}`,
      label: `${prize.name || '未命名奖品'}（剩余 ${drawableRandom + giftQuantity} 份）`,
      type: 'prize',
      prizeId: prize.id,
    })
  }
  return options
})
const selectedRoundIndex = computed(() => Math.max(0, prizeRoundOptions.value.findIndex((item) => item.id === selectedRoundId.value)))
const currentRound = computed(() => prizeRoundOptions.value[selectedRoundIndex.value] ?? null)
const currentRoundLabel = computed(() => currentRound.value?.label ?? '没有剩余轮次')
const currentRoundRandomCapacity = computed(() => {
  const round = currentRound.value
  if (!round || round.type === 'special-prize') return 0
  const eligibleCount = eligiblePrizeParticipants().length
  if (round.type === 'weighted') {
    const remaining = prizePool.value.reduce((sum, item) => sum + item.remaining, 0)
    return prizeNoRepeat.value ? Math.min(remaining, eligibleCount) : remaining
  }
  const remaining = randomRemainingForPrize(round.prizeId ?? '')
  return prizeNoRepeat.value ? Math.min(remaining, eligibleCount) : remaining
})
const currentRoundWillUseSpecial = computed(() => {
  const round = currentRound.value
  if (!round) return false
  if (round.type === 'special-prize') return true
  if (round.type !== 'prize') return false
  return currentRoundRandomCapacity.value === 0 && pendingSpecialGiftsForPrize(round.prizeId ?? '').length > 0
})
const showPrizeRoundCount = computed(() => mode.value === 'prize' && !currentRoundWillUseSpecial.value && currentRoundRandomCapacity.value > 0)
const currentRoundSummary = computed(() => {
  const round = currentRound.value
  if (!round) return ''
  if (round.type === 'weighted') return '本轮按剩余库存 × 权重，从混合奖池中随机选择奖品。'
  const prizeId = round.prizeId
  if (!prizeId) return ''
  const randomRemaining = randomRemainingForPrize(prizeId)
  const gifts = pendingSpecialGiftsForPrize(prizeId)
  const giftQuantity = gifts.reduce((sum, gift) => sum + gift.quantity, 0)
  if (currentRoundWillUseSpecial.value) {
    return `${prizeName(prizeId)}：本轮为特别赠礼。`
  }
  return giftQuantity > 0
    ? `${prizeName(prizeId)}：随机名额剩余 ${randomRemaining} 份，另有特别赠礼 ${giftQuantity} 份。`
    : `${prizeName(prizeId)}：随机名额剩余 ${randomRemaining} 份。`
})
const canDraw = computed(() => {
  if (drawing.value) return false
  if (mode.value === 'prize') return prizeRoundOptions.value.length > 0
  if (mode.value === 'random') {
    const excluded = new Set(optionResults.value.map((result) => result.optionId))
    return randomOptions.value.some((option) => !randomNoReplacement.value || !excluded.has(option.id))
  }
  return teamParticipants.value.length >= 2
})
const drawButtonLabel = computed(() => {
  if (mode.value === 'team') return '开始分组'
  if (!canDraw.value) return '已经全部抽完'
  if (mode.value === 'prize' && showPrizeRoundCount.value) return `摇动签筒 · 抽 ${prizeRoundDrawCount.value} 人`
  return '摇动签筒'
})
const drawProgressText = computed(() => {
  if (mode.value === 'prize') return `已发放 ${awards.value.reduce((sum, award) => sum + award.quantity, 0)} 份`
  if (mode.value === 'random') return `已抽出 ${optionResults.value.length} 个结果`
  return `${teamParticipants.value.length} 人 · ${teamGroupCount.value} 组`
})
const drawHint = computed(() => {
  if (drawing.value && batchRevealTotal.value > 1 && batchRevealIndex.value > 0) {
    return `第 ${batchRevealIndex.value} / ${batchRevealTotal.value} 位已揭晓`
  }
  if (drawing.value) return mode.value === 'team' ? '正在打乱名单并平衡人数' : '枫叶签正在翻动'
  if (!canDraw.value) return '本次活动已经完成'
  return mode.value === 'team' ? '摇动签筒，随机生成分组' : '摇动签筒，抽出一个结果'
})
const latestAward = computed(() => awards.value[awards.value.length - 1] ?? null)
const latestOptionResult = computed(() => lastRandomBatch.value[lastRandomBatch.value.length - 1] ?? optionResults.value[optionResults.value.length - 1] ?? null)
const latestResultBadge = computed(() => {
  if (mode.value === 'prize') {
    if (lastAwardBatch.value.length > 1) return `本轮抽中 ${lastAwardBatch.value.length} 人`
    return '随机抽中'
  }
  if (mode.value === 'random') return lastRandomBatch.value.length > 1 ? `本轮抽中 ${lastRandomBatch.value.length} 项` : '枫叶签结果'
  return '分组完成'
})
const latestResultKicker = computed(() => {
  if (mode.value === 'prize') {
    if (lastAwardBatch.value.length > 1) {
      const prizeIds = new Set(lastAwardBatch.value.map((award) => award.prizeId))
      return prizeIds.size === 1
        ? `${lastAwardBatch.value[0].prizeName} · ${lastAwardBatch.value.length} 份`
        : `混合奖池 · ${lastAwardBatch.value.length} 份`
    }
    return latestAward.value ? `${latestAward.value.prizeName} × ${latestAward.value.quantity}` : '尚未开奖'
  }
  if (mode.value === 'random') return '随机抽取结果'
  return `${teamParticipants.value.length} 人 · ${teamResults.value.length} 组`
})
const latestResultMain = computed(() => {
  if (mode.value === 'prize') return lastAwardBatch.value.length > 1 ? `${lastAwardBatch.value.length} 位获奖者` : latestAward.value?.recipient ?? '等待开奖'
  if (mode.value === 'random') return latestOptionResult.value?.label ?? '等待开奖'
  return '新的搭档'
})
const latestResultDetail = computed(() => {
  if (mode.value === 'prize') {
    if (lastAwardBatch.value.length > 1) return '本轮获奖名单已记录'
    return latestAward.value?.source === 'special' ? '来自主办方的特别心意' : '本轮结果已记录'
  }
  if (mode.value === 'random') return randomNoReplacement.value ? '已从本轮签池中移除' : '结果已记录'
  return '各组人数已尽量保持一致'
})
const continueDrawLabel = computed(() => {
  if (mode.value !== 'prize') return '继续抽取'
  const round = currentRound.value
  if (!round) return '继续抽取'
  if (round.type === 'weighted') return '继续混合抽取'
  return `继续 · ${prizeName(round.prizeId ?? '') || '下一轮'}`
})

watch(prizeRoundOptions, (options) => {
  if (!options.some((item) => item.id === selectedRoundId.value)) selectedRoundId.value = options[0]?.id ?? ''
}, { deep: true, immediate: true })

watch(currentRoundRandomCapacity, (capacity) => {
  prizeRoundDrawCount.value = Math.max(1, Math.min(prizeRoundDrawCount.value, Math.max(1, capacity)))
}, { immediate: true })

watch(
  [activityName, mode, nature, prizeDrawStrategy, allowSpecialGifts, prizes, specialGifts, prizeParticipantText, prizeNoRepeat, prizeRoundDrawCount,
    randomOptionText, randomDrawCount, randomNoReplacement, randomUseWeights, randomWeightMap,
    teamParticipantText, teamGroupCount, teamGroupNamesText, awards, optionResults, teamResults, activeStep, maxStep],
  () => { if (draftReady) saveDraft() },
  { deep: true },
)

onMounted(() => {
  loadHistory()
  loadDraft()
  if (prizeDrawStrategy.value === 'weighted') showPrizeAdvanced.value = true
  draftReady = true
})

onUnmounted(() => {
  if (drawTimer) clearInterval(drawTimer)
  if (revealTimer) clearTimeout(revealTimer)
})

function setMode(value: LotteryMode) {
  if (mode.value === value) return
  mode.value = value
  selectedTemplateId.value = null
  invalidateResults()
  activeStep.value = 1
  maxStep.value = 1
  if (value !== 'prize') allowSpecialGifts.value = false
  if (value === 'prize' && nature.value === 'internal') allowSpecialGifts.value = true
}

function setNature(value: LotteryNature) {
  nature.value = value
  if (value === 'public') allowSpecialGifts.value = false
}

function setPrizeDrawStrategy(value: PrizeDrawStrategy) {
  if (prizeDrawStrategy.value === value) return
  prizeDrawStrategy.value = value
  invalidateResults()
  maxStep.value = Math.min(maxStep.value, 3)
}

function togglePrizeAdvanced() {
  showPrizeAdvanced.value = !showPrizeAdvanced.value
}

function applyTemplate(templateId: LotteryTemplateId) {
  selectedTemplateId.value = templateId
  activityName.value = '我的抽奖活动'
  mode.value = 'prize'
  nature.value = 'internal'
  prizeDrawStrategy.value = 'by-prize'
  allowSpecialGifts.value = true
  prizes.value = defaultPrizes()
  specialGifts.value = []
  prizeParticipantText.value = ''
  prizeNoRepeat.value = true
  prizeRoundDrawCount.value = 1
  randomOptionText.value = ''
  randomDrawCount.value = 1
  randomNoReplacement.value = true
  randomUseWeights.value = false
  randomWeightMap.value = {}
  teamParticipantText.value = ''
  teamGroupCount.value = 2
  teamGroupNamesText.value = '枫叶组，银杏组'
  showPrizeAdvanced.value = false

  if (templateId === 'food') {
    activityName.value = '今天吃什么'
    mode.value = 'random'
    randomOptionText.value = '面馆\n盖浇饭\n轻食\n火锅\n日料\n烧烤\n咖啡简餐'
  } else if (templateId === 'outing') {
    activityName.value = '今天去哪玩'
    mode.value = 'random'
    randomOptionText.value = '逛公园\n看电影\n去展览\n骑行\n桌游\n咖啡馆\n打保龄球'
  } else if (templateId === 'captain') {
    activityName.value = '抽队长'
    mode.value = 'random'
  } else if (templateId === 'annual') {
    activityName.value = '年会抽奖'
  } else {
    activityName.value = '随机分组'
    mode.value = 'team'
  }

  invalidateResults()
  activeStep.value = 1
  maxStep.value = 1
  uni.showToast({ title: '已填入模板', icon: 'success' })
}

function switchValue(event: Event): boolean {
  return Boolean((event as unknown as SwitchEvent).detail.value)
}

function onSpecialToggle(event: Event) {
  if (nature.value === 'public') return
  allowSpecialGifts.value = switchValue(event)
}

function onPrizeNoRepeatChange(event: Event) {
  prizeNoRepeat.value = switchValue(event)
}

function onRandomReplacementChange(event: Event) {
  randomNoReplacement.value = switchValue(event)
}

function onRandomWeightToggle(event: Event) {
  randomUseWeights.value = switchValue(event)
}

function appendClipboard(target: ClipboardTarget) {
  uni.getClipboardData({
    success: (result) => {
      const text = String(result.data ?? '').trim()
      if (!text) {
        uni.showToast({ title: '剪贴板里没有可用内容', icon: 'none' })
        return
      }
      const current = target === 'prize'
        ? prizeParticipantText.value
        : target === 'random'
          ? randomOptionText.value
          : teamParticipantText.value
      const combined = current.trim() ? `${current.trim()}\n${text}` : text
      if (target === 'prize') prizeParticipantText.value = combined
      else if (target === 'random') randomOptionText.value = combined
      else teamParticipantText.value = combined
      uni.showToast({ title: '已粘贴到名单', icon: 'success' })
    },
    fail: () => uni.showToast({ title: '读取剪贴板失败', icon: 'none' }),
  })
}

function goStep(step: number) {
  if (step > maxStep.value) {
    uni.showToast({ title: '请先完成当前步骤', icon: 'none' })
    return
  }
  activeStep.value = step
}

function nextFromSetup() {
  if (!activityName.value.trim()) {
    uni.showToast({ title: '请填写活动名称', icon: 'none' })
    return
  }
  maxStep.value = Math.max(maxStep.value, 2)
  activeStep.value = 2
}

function nextFromContent() {
  if (mode.value === 'prize') {
    if (!prizes.value.length || prizes.value.some((prize) => !prize.name.trim())) {
      uni.showToast({ title: '请填写完整的奖品名称', icon: 'none' })
      return
    }
    if (!specialGiftValidation.value.valid) {
      uni.showToast({ title: specialGiftValidation.value.errors[0], icon: 'none' })
      return
    }
  } else if (mode.value === 'random' && randomParsedOptions.value.length < 2) {
    uni.showToast({ title: '至少填写两个候选项', icon: 'none' })
    return
  } else if (mode.value === 'team' && teamParticipants.value.length < 2) {
    uni.showToast({ title: '至少填写两位参与者', icon: 'none' })
    return
  }
  maxStep.value = Math.max(maxStep.value, 3)
  activeStep.value = 3
}

function startActivity() {
  if (mode.value === 'prize') {
    if (prizeParticipants.value.length < 1) {
      uni.showToast({ title: '请添加至少一位参与者', icon: 'none' })
      return
    }
    if (specialGiftAssignmentErrors.value.length) {
      uni.showToast({ title: specialGiftAssignmentErrors.value[0], icon: 'none' })
      return
    }
  }
  if (mode.value === 'random') {
    if (randomOptions.value.length < 2) {
      uni.showToast({ title: '至少需要两个候选项', icon: 'none' })
      return
    }
    if (randomNoReplacement.value && randomDrawCount.value > randomOptions.value.length) {
      uni.showToast({ title: '抽取数量不能超过候选数量', icon: 'none' })
      return
    }
  }
  if (mode.value === 'team' && (teamGroupCount.value < 2 || teamGroupCount.value > teamParticipants.value.length)) {
    uni.showToast({ title: '分组数需要在 2 到参与人数之间', icon: 'none' })
    return
  }
  invalidateResults()
  maxStep.value = 4
  activeStep.value = 4
  rollingText.value = '准备开奖'
}

function addPrize() {
  prizes.value.push({ id: makeId('prize'), name: `奖品 ${prizes.value.length + 1}`, quantity: 1, weight: 1 })
}

function removePrize(prizeId: string) {
  if (prizes.value.length <= 1) {
    uni.showToast({ title: '至少保留一个奖品', icon: 'none' })
    return
  }
  const hasGift = specialGifts.value.some((gift) => gift.prizeId === prizeId)
  if (hasGift) {
    uni.showToast({ title: '请先删除关联的特别赠礼', icon: 'none' })
    return
  }
  prizes.value = prizes.value.filter((prize) => prize.id !== prizeId)
}

function changePrizeQuantity(prize: LotteryPrize, delta: number) {
  prize.quantity = Math.max(1, Math.min(999, prize.quantity + delta))
}

function changePrizeWeight(prize: LotteryPrize, delta: number) {
  prize.weight = Math.max(1, Math.min(100, prize.weight + delta))
}

function addSpecialGift() {
  const firstPrize = prizes.value[0]
  if (!firstPrize) {
    uni.showToast({ title: '请先添加奖品', icon: 'none' })
    return
  }
  specialGifts.value.push({ id: makeId('gift'), prizeId: firstPrize.id, quantity: 1, recipient: '' })
}

function removeSpecialGift(giftId: string) {
  specialGifts.value = specialGifts.value.filter((gift) => gift.id !== giftId)
}

function changeGiftQuantity(gift: LotterySpecialGift, delta: number) {
  gift.quantity = Math.max(1, Math.min(999, gift.quantity + delta))
}

function giftPrizeIndex(gift: LotterySpecialGift): number {
  return Math.max(0, prizePickerOptions.value.findIndex((item) => item.id === gift.prizeId))
}

function onGiftPrizeChange(gift: LotterySpecialGift, event: PickerEvent) {
  const option = prizePickerOptions.value[Number(event.detail.value)]
  if (option) gift.prizeId = option.id
}

function giftRecipientIndex(gift: LotterySpecialGift): number {
  const index = prizeParticipants.value.findIndex((name) => normalizeName(name) === normalizeName(gift.recipient))
  return Math.max(0, index)
}

function onGiftRecipientChange(gift: LotterySpecialGift, event: PickerEvent) {
  const recipient = prizeParticipants.value[Number(event.detail.value)]
  if (recipient) gift.recipient = recipient
}

function isGiftRecipientValid(gift: LotterySpecialGift): boolean {
  if (!gift.recipient.trim()) return false
  return prizeParticipants.value.some((name) => normalizeName(name) === normalizeName(gift.recipient))
}

function giftRecipientLabel(gift: LotterySpecialGift): string {
  if (!gift.recipient.trim()) return prizeParticipants.value.length ? '请选择参与者' : '请先填写名单'
  if (!isGiftRecipientValid(gift)) return `${gift.recipient}（不在名单）`
  return gift.recipient
}

function prizeName(prizeId: string): string {
  return prizes.value.find((prize) => prize.id === prizeId)?.name ?? ''
}

function randomRemainingForPrize(prizeId: string): number {
  return prizePool.value.find((item) => item.prizeId === prizeId)?.remaining ?? 0
}

function pendingSpecialGiftsForPrize(prizeId: string): LotterySpecialGift[] {
  return activeSpecialGifts.value.filter((gift) => gift.prizeId === prizeId && !drawnSpecialGiftIds.value.has(gift.id))
}

function reservedForPrize(prizeId: string): number {
  return specialGiftValidation.value.reservedByPrize[prizeId] ?? 0
}

function formatProbability(prizeId: string): string {
  const probability = prizePool.value.find((item) => item.prizeId === prizeId)?.probability ?? 0
  return `${(probability * 100).toFixed(1)}%`
}

function changeRandomDrawCount(delta: number) {
  randomDrawCount.value = Math.max(1, Math.min(99, randomDrawCount.value + delta))
}

function changePrizeRoundDrawCount(delta: number) {
  const maximum = Math.max(1, currentRoundRandomCapacity.value)
  prizeRoundDrawCount.value = Math.max(1, Math.min(maximum, prizeRoundDrawCount.value + delta))
}

function changeRandomWeight(label: string, delta: number) {
  randomWeightMap.value[label] = Math.max(1, Math.min(100, (randomWeightMap.value[label] ?? 1) + delta))
}

function changeTeamCount(delta: number) {
  const max = Math.max(2, teamParticipants.value.length || 2)
  teamGroupCount.value = Math.max(2, Math.min(max, teamGroupCount.value + delta))
}

function onRoundChange(event: PickerEvent) {
  const option = prizeRoundOptions.value[Number(event.detail.value)]
  if (option) {
    selectedRoundId.value = option.id
    prizeRoundDrawCount.value = 1
  }
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function formatDuplicateNames(names: string[]): string {
  const visible = names.slice(0, 3).join('、')
  return names.length > 3 ? `${visible} 等 ${names.length} 项` : visible
}

function eligiblePrizeParticipants(): string[] {
  if (!prizeNoRepeat.value) return prizeParticipants.value
  const winnerNames = new Set(awards.value.map((award) => normalizeName(award.recipient)))
  for (const gift of activeSpecialGifts.value) {
    if (gift.recipient.trim()) winnerNames.add(normalizeName(gift.recipient))
  }
  return prizeParticipants.value.filter((name) => !winnerNames.has(normalizeName(name)))
}

function invalidateResults() {
  awards.value = []
  lastAwardBatch.value = []
  optionResults.value = []
  lastRandomBatch.value = []
  teamResults.value = []
  selectedRoundId.value = ''
  prizeRoundDrawCount.value = 1
  batchRevealIndex.value = 0
  batchRevealTotal.value = 0
  rollingText.value = '准备开奖'
}

function waitForReveal(duration: number): Promise<void> {
  return new Promise((resolve) => {
    revealTimer = setTimeout(() => {
      revealTimer = null
      resolve()
    }, duration)
  })
}

async function revealBatchInStage(labels: string[]) {
  batchRevealTotal.value = labels.length
  batchRevealIndex.value = 0
  if (labels.length < 2) return

  for (let index = 0; index < labels.length; index++) {
    batchRevealIndex.value = index + 1
    rollingText.value = labels[index]
    try { uni.vibrateShort({}) } catch { /* H5 may not expose vibration. */ }
    await waitForReveal(720)
  }
}

function advancePrizeRound(completedRoundId: string) {
  if (prizeDrawStrategy.value !== 'by-prize') return
  const options = prizeRoundOptions.value
  if (!options.some((option) => option.id === completedRoundId)) {
    selectedRoundId.value = options[0]?.id ?? ''
    prizeRoundDrawCount.value = 1
  }
}

async function performDraw() {
  if (drawing.value || !canDraw.value) return

  let finalText = ''
  let commit: (() => void) | null = null
  let rollingValues: string[] = []
  let revealedLabels: string[] = []
  let completedRoundId = ''

  if (mode.value === 'prize') {
    const round = currentRound.value
    if (!round) return
    completedRoundId = round.id
    rollingValues = prizeParticipants.value.length ? prizeParticipants.value : ['好运正在靠近']
    const roundPrizeId = round.prizeId ?? ''
    const pendingGifts = roundPrizeId ? pendingSpecialGiftsForPrize(roundPrizeId) : []
    const useSpecialGift = round.type === 'special-prize'
      || (round.type === 'prize' && (randomRemainingForPrize(roundPrizeId) <= 0 || eligiblePrizeParticipants().length === 0))

    if (useSpecialGift) {
      const gift = pendingGifts[0]
      if (!gift || !gift.recipient.trim()) {
        uni.showToast({ title: '特别赠礼信息不完整', icon: 'none' })
        return
      }
      const prize = prizes.value.find((item) => item.id === gift.prizeId)
      if (!prize) return
      finalText = gift.recipient.trim()
      const award: LotteryAward = {
        id: makeId('award'),
        source: 'special',
        recipient: gift.recipient.trim(),
        prizeId: prize.id,
        prizeName: prize.name,
        quantity: gift.quantity,
        specialGiftId: gift.id,
        createdAt: Date.now(),
      }
      commit = () => {
        lastAwardBatch.value = [award]
        awards.value.push(award)
      }
      revealedLabels = [award.recipient]
    } else {
      const drawCount = Math.min(prizeRoundDrawCount.value, currentRoundRandomCapacity.value)
      const localAwarded = { ...awardedByPrize.value }
      const availableParticipants = [...eligiblePrizeParticipants()]
      const batch: LotteryAward[] = []

      for (let index = 0; index < drawCount; index++) {
        const pool = calculatePrizePool(prizes.value, activeSpecialGifts.value, localAwarded)
        const poolItem = round.type === 'weighted'
          ? pickWeighted(pool.filter((item) => item.remaining > 0), (item) => item.effectiveWeight)
          : pool.find((item) => item.prizeId === roundPrizeId && item.remaining > 0) ?? null
        const participantPool = prizeNoRepeat.value ? availableParticipants : prizeParticipants.value
        const participant = pickRandom(participantPool)
        if (!poolItem || !participant) break
        const prize = prizes.value.find((item) => item.id === poolItem.prizeId)
        if (!prize) break
        batch.push({
          id: makeId('award'),
          source: 'random',
          recipient: participant,
          prizeId: prize.id,
          prizeName: prize.name,
          quantity: 1,
          createdAt: Date.now(),
        })
        localAwarded[prize.id] = (localAwarded[prize.id] ?? 0) + 1
        if (prizeNoRepeat.value) {
          const participantIndex = availableParticipants.findIndex((name) => normalizeName(name) === normalizeName(participant))
          if (participantIndex >= 0) availableParticipants.splice(participantIndex, 1)
        }
      }

      if (!batch.length) {
        uni.showToast({ title: '没有可继续中奖的参与者或奖品', icon: 'none' })
        return
      }
      finalText = batch.length === 1 ? batch[0].recipient : `${batch.length} 位获奖者`
      commit = () => {
        lastAwardBatch.value = batch
        awards.value.push(...batch)
      }
      revealedLabels = batch.map((award) => award.recipient)
    }
  } else if (mode.value === 'random') {
    const excluded = randomNoReplacement.value ? new Set(optionResults.value.map((result) => result.optionId)) : new Set<string>()
    const selected = drawWeightedOptions(randomOptions.value, randomDrawCount.value, excluded, !randomNoReplacement.value)
    if (!selected.length) {
      uni.showToast({ title: '候选项已经抽完', icon: 'none' })
      return
    }
    rollingValues = randomOptions.value.map((option) => option.label)
    finalText = selected[selected.length - 1].label
    commit = () => {
      const batch = selected.map<LotteryOptionResult>((option) => ({
        id: makeId('result'),
        optionId: option.id,
        label: option.label,
        createdAt: Date.now(),
      }))
      lastRandomBatch.value = batch
      optionResults.value.push(...batch)
    }
    revealedLabels = selected.map((option) => option.label)
  } else {
    rollingValues = ['正在打乱顺序', '正在平衡人数', '正在生成分组']
    finalText = '分组完成'
    commit = () => {
      const groups = createBalancedGroups(teamParticipants.value, teamGroupCount.value)
      const customNames = teamGroupNamesText.value.split(/[，,]/).map((name) => name.trim()).filter(Boolean)
      teamResults.value = groups.map((members, index) => ({
        id: makeId('group'),
        name: customNames[index] || MAPLE_GROUP_NAMES[index] || `第 ${index + 1} 组`,
        members,
      }))
    }
  }

  drawing.value = true
  maxStep.value = Math.max(maxStep.value, 4)
  try { uni.vibrateShort({}) } catch { /* H5 may not expose vibration. */ }
  let cursor = 0
  rollingText.value = rollingValues[0] || '好运正在靠近'
  drawTimer = setInterval(() => {
    rollingText.value = rollingValues[cursor % rollingValues.length] || '好运正在靠近'
    cursor += 1
  }, 85)
  await new Promise((resolve) => setTimeout(resolve, 1550))
  if (drawTimer) clearInterval(drawTimer)
  drawTimer = null
  rollingText.value = finalText
  commit?.()
  if (mode.value === 'prize') advancePrizeRound(completedRoundId)
  await revealBatchInStage(revealedLabels)
  drawing.value = false
  maxStep.value = 5
  activeStep.value = 5
}

function continueDrawing() {
  activeStep.value = 4
  batchRevealIndex.value = 0
  batchRevealTotal.value = 0
  rollingText.value = '准备开奖'
}

function padNumber(value: number): string {
  return value.toString().padStart(2, '0')
}

function resultSummaryText(): string {
  const title = activityName.value.trim() || '枫叶签筒'
  if (mode.value === 'prize') {
    const lines = awards.value.map((award, index) => `${index + 1}. ${award.recipient}｜${award.prizeName} × ${award.quantity}｜${award.source === 'special' ? '特别赠礼' : '随机抽中'}`)
    return `${title}\n${lines.join('\n')}`
  }
  if (mode.value === 'random') {
    return `${title}\n${optionResults.value.map((result, index) => `${index + 1}. ${result.label}`).join('\n')}`
  }
  return `${title}\n${teamResults.value.map((group) => `${group.name}：${group.members.join('、')}`).join('\n')}`
}

function ruleSummaryText(): string {
  if (mode.value === 'prize') {
    const strategy = prizeDrawStrategy.value === 'weighted' ? '混合奖池权重' : '按奖项逐轮'
    return `${strategy} · ${prizeParticipants.value.length} 人 · ${prizeNoRepeat.value ? '不重复中奖' : '允许重复中奖'}`
  }
  if (mode.value === 'random') {
    return `${randomOptions.value.length} 个候选项 · 每轮 ${randomDrawCount.value} 个${randomNoReplacement.value ? ' · 不放回' : ''}`
  }
  return `${teamParticipants.value.length} 人 · ${teamGroupCount.value} 组`
}

function copyResults() {
  uni.setClipboardData({
    data: resultSummaryText(),
    success: () => uni.showToast({ title: '结果已复制', icon: 'success' }),
  })
}

function finishActivity() {
  saveHistory()
  saveDraft()
  uni.showToast({ title: '活动已保存', icon: 'success' })
}

function saveHistory() {
  const summary = mode.value === 'prize'
    ? `${awards.value.length} 条发放记录`
    : mode.value === 'random'
      ? `${optionResults.value.length} 个抽取结果`
      : `${teamResults.value.length} 个分组`
  const record: LotteryHistoryItem = {
    id: makeId('history'),
    name: activityName.value.trim() || '未命名活动',
    mode: mode.value,
    completedAt: Date.now(),
    summary,
    rules: ruleSummaryText(),
    resultText: resultSummaryText(),
  }
  historyItems.value = [record, ...historyItems.value].slice(0, 20)
  uni.setStorageSync(HISTORY_KEY, JSON.stringify(historyItems.value))
}

function loadHistory() {
  const raw = uni.getStorageSync(HISTORY_KEY)
  if (!raw) {
    historyItems.value = []
    return
  }
  try {
    const parsed = JSON.parse(String(raw)) as Array<Partial<LotteryHistoryItem>>
    historyItems.value = Array.isArray(parsed)
      ? parsed.flatMap((item) => {
        if (!item.id || !item.name || !item.mode || !item.completedAt || !item.summary) return []
        if (!['prize', 'random', 'team'].includes(item.mode)) return []
        return [{
          id: item.id,
          name: item.name,
          mode: item.mode,
          completedAt: item.completedAt,
          summary: item.summary,
          rules: item.rules ?? '',
          resultText: item.resultText ?? `${item.name}\n${item.summary}`,
        }]
      })
      : []
  } catch {
    historyItems.value = []
  }
}

function openHistory() {
  loadHistory()
  showHistory.value = true
}

function closeHistory() {
  showHistory.value = false
}

function historyModeLabel(value: LotteryMode): string {
  return modeItems.find((item) => item.id === value)?.label ?? '活动'
}

function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = padNumber(date.getMonth() + 1)
  const day = padNumber(date.getDate())
  const hour = padNumber(date.getHours())
  const minute = padNumber(date.getMinutes())
  return `${month}-${day} ${hour}:${minute}`
}

function copyHistoryItem(item: LotteryHistoryItem) {
  uni.setClipboardData({
    data: item.resultText,
    success: () => uni.showToast({ title: '记录已复制', icon: 'success' }),
  })
}

function confirmClearHistory() {
  uni.showModal({
    title: '清空活动记录',
    content: '本机保存的活动记录会被清空，确定继续吗？',
    confirmText: '清空',
    success: (result) => {
      if (!result.confirm) return
      historyItems.value = []
      uni.removeStorageSync(HISTORY_KEY)
    },
  })
}

function saveDraft() {
  const draft: LotteryDraft = {
    activityName: activityName.value,
    mode: mode.value,
    nature: nature.value,
    prizeDrawStrategy: prizeDrawStrategy.value,
    allowSpecialGifts: allowSpecialGifts.value,
    prizes: prizes.value,
    specialGifts: specialGifts.value,
    prizeParticipantText: prizeParticipantText.value,
    prizeNoRepeat: prizeNoRepeat.value,
    prizeRoundDrawCount: prizeRoundDrawCount.value,
    randomOptionText: randomOptionText.value,
    randomDrawCount: randomDrawCount.value,
    randomNoReplacement: randomNoReplacement.value,
    randomUseWeights: randomUseWeights.value,
    randomWeightMap: randomWeightMap.value,
    teamParticipantText: teamParticipantText.value,
    teamGroupCount: teamGroupCount.value,
    teamGroupNamesText: teamGroupNamesText.value,
    awards: awards.value,
    optionResults: optionResults.value,
    teamResults: teamResults.value,
    activeStep: activeStep.value,
    maxStep: maxStep.value,
  }
  uni.setStorageSync(DRAFT_KEY, JSON.stringify(draft))
}

function loadDraft() {
  const raw = uni.getStorageSync(DRAFT_KEY)
  if (!raw) return
  try {
    const draft = JSON.parse(String(raw)) as Partial<LotteryDraft>
    if (typeof draft.activityName === 'string') activityName.value = draft.activityName
    if (draft.mode && ['prize', 'random', 'team'].includes(draft.mode)) mode.value = draft.mode
    if (draft.nature && ['public', 'internal'].includes(draft.nature)) nature.value = draft.nature
    if (draft.prizeDrawStrategy && ['by-prize', 'weighted'].includes(draft.prizeDrawStrategy)) prizeDrawStrategy.value = draft.prizeDrawStrategy
    if (typeof draft.allowSpecialGifts === 'boolean') allowSpecialGifts.value = draft.allowSpecialGifts
    if (Array.isArray(draft.prizes) && draft.prizes.length) prizes.value = draft.prizes
    if (Array.isArray(draft.specialGifts)) specialGifts.value = draft.specialGifts
    if (typeof draft.prizeParticipantText === 'string') prizeParticipantText.value = draft.prizeParticipantText
    if (typeof draft.prizeNoRepeat === 'boolean') prizeNoRepeat.value = draft.prizeNoRepeat
    if (typeof draft.prizeRoundDrawCount === 'number') prizeRoundDrawCount.value = draft.prizeRoundDrawCount
    if (typeof draft.randomOptionText === 'string') randomOptionText.value = draft.randomOptionText
    if (typeof draft.randomDrawCount === 'number') randomDrawCount.value = draft.randomDrawCount
    if (typeof draft.randomNoReplacement === 'boolean') randomNoReplacement.value = draft.randomNoReplacement
    if (typeof draft.randomUseWeights === 'boolean') randomUseWeights.value = draft.randomUseWeights
    if (draft.randomWeightMap && typeof draft.randomWeightMap === 'object') randomWeightMap.value = draft.randomWeightMap
    if (typeof draft.teamParticipantText === 'string') teamParticipantText.value = draft.teamParticipantText
    if (typeof draft.teamGroupCount === 'number') teamGroupCount.value = draft.teamGroupCount
    if (typeof draft.teamGroupNamesText === 'string') teamGroupNamesText.value = draft.teamGroupNamesText
    if (Array.isArray(draft.awards)) awards.value = draft.awards
    if (Array.isArray(draft.optionResults)) optionResults.value = draft.optionResults
    if (Array.isArray(draft.teamResults)) teamResults.value = draft.teamResults
    if (typeof draft.maxStep === 'number') maxStep.value = Math.max(1, Math.min(5, draft.maxStep))
    if (typeof draft.activeStep === 'number') activeStep.value = Math.max(1, Math.min(maxStep.value, draft.activeStep))
    if (mode.value === 'prize' && specialGiftAssignmentErrors.value.length && maxStep.value > 3) {
      maxStep.value = 3
      activeStep.value = Math.min(activeStep.value, 3)
    }
  } catch {
    uni.removeStorageSync(DRAFT_KEY)
  }
}

function confirmReset() {
  uni.showModal({
    title: '新建活动',
    content: '当前草稿会被清空，确定继续吗？',
    confirmText: '新建',
    success: (result) => { if (result.confirm) resetActivity() },
  })
}

function resetActivity() {
  if (drawTimer) clearInterval(drawTimer)
  if (revealTimer) clearTimeout(revealTimer)
  drawTimer = null
  revealTimer = null
  activityName.value = '我的抽奖活动'
  mode.value = 'prize'
  nature.value = 'internal'
  prizeDrawStrategy.value = 'by-prize'
  allowSpecialGifts.value = true
  prizes.value = defaultPrizes()
  specialGifts.value = []
  prizeParticipantText.value = ''
  prizeNoRepeat.value = true
  prizeRoundDrawCount.value = 1
  randomOptionText.value = ''
  randomDrawCount.value = 1
  randomNoReplacement.value = true
  randomUseWeights.value = false
  randomWeightMap.value = {}
  teamParticipantText.value = ''
  teamGroupCount.value = 2
  teamGroupNamesText.value = '枫叶组，银杏组'
  awards.value = []
  lastAwardBatch.value = []
  optionResults.value = []
  teamResults.value = []
  lastRandomBatch.value = []
  selectedRoundId.value = ''
  selectedTemplateId.value = null
  showPrizeAdvanced.value = false
  batchRevealIndex.value = 0
  batchRevealTotal.value = 0
  rollingText.value = '准备开奖'
  drawing.value = false
  showHistory.value = false
  activeStep.value = 1
  maxStep.value = 1
  uni.removeStorageSync(DRAFT_KEY)
}
</script>

<style lang="scss" scoped>
$maple: #c64f3d;
$maple-dark: #983a2f;
$maple-soft: #f9e5e1;
$forest: #4f7658;
$forest-soft: #e9f1eb;
$ink: #34332f;

.lottery {
  padding: 28rpx 28rpx 80rpx;
  color: $color-text;

  &__brand {
    display: flex;
    align-items: center;
    gap: 20rpx;
    margin-bottom: 24rpx;
  }

  &__brand-mark {
    width: 72rpx;
    height: 72rpx;
    border-radius: $radius-md;
    background: $maple-soft;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    flex-shrink: 0;
  }

  &__brand-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__brand-actions,
  &__section-action {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__brand-kicker,
  &__eyebrow {
    font-size: 22rpx;
    color: $color-text-secondary;
  }

  &__brand-title {
    font-size: 34rpx;
    font-weight: 700;
    color: $ink;
  }

  &__new,
  &__compact-btn {
    color: $maple-dark;
    font-size: 24rpx;
    font-weight: 600;
    padding: 12rpx 18rpx;
    border: 2rpx solid rgba($maple, 0.28);
    border-radius: $radius-sm;
    flex-shrink: 0;
  }

  &__text-btn {
    color: $forest;
    font-size: 24rpx;
    font-weight: 600;
    padding: 12rpx 8rpx;
    flex-shrink: 0;
  }

  &__text-btn--danger {
    color: $color-danger;
  }

  &__step-scroll {
    width: 100%;
    margin-bottom: 28rpx;
  }

  &__steps {
    min-width: 660rpx;
    display: flex;
    gap: 8rpx;
    padding: 4rpx 0 14rpx;
    border-bottom: 2rpx solid $color-border;
  }

  &__step {
    width: 124rpx;
    min-height: 90rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6rpx;
    color: $color-text-secondary;
    border-radius: $radius-sm;
    opacity: 0.48;
  }

  &__step--ready {
    opacity: 1;
  }

  &__step--active {
    background: $maple;
    color: #fff;
  }

  &__step-icon {
    height: 32rpx;
    font-size: 26rpx;
    display: flex;
    align-items: center;
  }

  &__step-label {
    font-size: 22rpx;
  }

  &__screen {
    display: flex;
    flex-direction: column;
    gap: 28rpx;
  }

  &__heading {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__heading--row,
  &__section-head,
  &__gift-head,
  &__group-head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    display: block;
    font-size: 40rpx;
    font-weight: 700;
    color: $ink;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  &__field--compact {
    gap: 8rpx;
  }

  &__label,
  &__section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: $ink;
  }

  &__input,
  &__textarea,
  &__picker {
    width: 100%;
    border: 2rpx solid $color-border;
    background: #fff;
    border-radius: $radius-sm;
    color: $color-text;
    font-size: 28rpx;
    box-sizing: border-box;
  }

  &__input {
    height: 84rpx;
    padding: 0 24rpx;
  }

  &__input--compact {
    height: 72rpx;
    padding: 0 20rpx;
  }

  &__textarea {
    min-height: 260rpx;
    padding: 20rpx 24rpx;
  }

  &__textarea--large {
    min-height: 340rpx;
  }

  &__picker {
    min-height: 72rpx;
    padding: 17rpx 20rpx;
  }

  &__picker--strong {
    font-weight: 600;
    border-color: rgba($maple, 0.35);
  }

  &__mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14rpx;
  }

  &__template-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12rpx;
  }

  &__template {
    min-height: 92rpx;
    padding: 12rpx 8rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4rpx;
    box-sizing: border-box;
  }

  &__template--active {
    border-color: $maple;
    background: $maple-soft;
    color: $maple-dark;
  }

  &__template-icon {
    height: 30rpx;
    font-size: 28rpx;
    line-height: 1;
  }

  &__template-label {
    font-size: 22rpx;
    text-align: center;
    word-break: break-all;
  }

  &__mode {
    min-height: 146rpx;
    padding: 18rpx 8rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6rpx;
    text-align: center;
  }

  &__mode--active {
    border-color: $maple;
    background: $maple-soft;
    color: $maple-dark;
  }

  &__mode-icon {
    font-size: 34rpx;
    height: 40rpx;
  }

  &__mode-name {
    font-size: 26rpx;
    font-weight: 600;
  }

  &__mode-hint {
    font-size: 20rpx;
    color: $color-text-secondary;
  }

  &__segment {
    display: flex;
    gap: 10rpx;
  }

  &__segment-item {
    flex: 1;
    height: 70rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26rpx;
  }

  &__segment-item--active {
    background: $forest;
    border-color: $forest;
    color: #fff;
  }

  &__advanced {
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
  }

  &__advanced-head {
    min-height: 96rpx;
    padding: 18rpx 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
  }

  &__advanced-head > view:first-child {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__advanced-arrow {
    width: 44rpx;
    color: $forest;
    font-size: 30rpx;
    text-align: center;
    flex-shrink: 0;
  }

  &__advanced-content {
    padding: 0 0 20rpx;
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }

  &__switch-row,
  &__rule-row,
  &__summary-band {
    min-height: 96rpx;
    padding: 20rpx 0;
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
  }

  &__switch-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__switch-title {
    font-size: 28rpx;
    font-weight: 600;
    color: $ink;
  }

  &__switch-hint,
  &__section-note,
  &__control-label,
  &__result-sub {
    font-size: 22rpx;
    color: $color-text-secondary;
  }

  &__notice {
    padding: 18rpx 20rpx;
    background: $forest-soft;
    color: $forest;
    font-size: 24rpx;
    border-radius: $radius-sm;
  }

  &__duplicate-note {
    color: $maple-dark;
    font-size: 22rpx;
    line-height: 1.5;
    word-break: break-all;
  }

  &__footer {
    display: grid;
    grid-template-columns: minmax(150rpx, 0.65fr) minmax(260rpx, 1.35fr);
    gap: 18rpx;
    padding-top: 22rpx;
    border-top: 2rpx solid $color-border;
  }

  &__primary-btn,
  &__secondary-btn,
  &__copy-btn {
    min-height: 82rpx;
    padding: 0 24rpx;
    border-radius: $radius-sm;
    font-size: 28rpx;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12rpx;
    box-sizing: border-box;
  }

  &__primary-btn {
    background: $maple;
    color: #fff;
  }

  &__primary-btn--full,
  &__secondary-btn--full {
    width: 100%;
  }

  &__primary-btn--disabled {
    opacity: 0.42;
  }

  &__secondary-btn,
  &__copy-btn {
    border: 2rpx solid $color-border;
    background: #fff;
    color: $ink;
  }

  &__section-head,
  &__gift-head,
  &__group-head {
    display: flex;
    gap: 16rpx;
  }

  &__section-head > view:first-child {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__list,
  &__gift-section,
  &__weight-list,
  &__result-list,
  &__groups,
  &__history-list {
    display: flex;
    flex-direction: column;
  }

  &__prize-row {
    padding: 24rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__prize-top {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }

  &__prize-index {
    width: 46rpx;
    height: 46rpx;
    border-radius: $radius-sm;
    background: $maple-soft;
    color: $maple-dark;
    font-size: 22rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__inline-input {
    flex: 1;
    min-width: 0;
    height: 60rpx;
    font-size: 28rpx;
    font-weight: 600;
    color: $ink;
  }

  &__icon-btn {
    width: 52rpx;
    height: 52rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $color-danger;
    font-size: 36rpx;
    flex-shrink: 0;
  }

  &__prize-controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14rpx;
  }

  &__prize-controls--simple {
    grid-template-columns: 164rpx;
  }

  &__control-block,
  &__probability {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__probability {
    align-items: flex-end;
    justify-content: flex-end;
  }

  &__probability-value {
    font-size: 28rpx;
    font-weight: 700;
    color: $forest;
  }

  &__stepper {
    height: 58rpx;
    display: grid;
    grid-template-columns: 54rpx 52rpx 54rpx;
    align-items: center;
    border: 2rpx solid $color-border;
    border-radius: $radius-sm;
    background: #fff;
    overflow: hidden;
  }

  &__stepper--wide {
    width: 164rpx;
  }

  &__stepper-btn,
  &__stepper-value {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 25rpx;
  }

  &__stepper-btn {
    color: $maple-dark;
    background: $maple-soft;
  }

  &__stepper-value {
    color: $ink;
    font-weight: 600;
  }

  &__reserved-note {
    font-size: 22rpx;
    color: $maple-dark;
  }

  &__gift-section {
    gap: 18rpx;
    padding-top: 8rpx;
  }

  &__gift-rule {
    padding: 22rpx 0;
    border-top: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__gift-title {
    font-size: 26rpx;
    font-weight: 600;
    color: $maple-dark;
  }

  &__gift-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 176rpx;
    gap: 16rpx;
    align-items: end;
  }

  &__gift-target-preview {
    min-height: 66rpx;
    padding: 14rpx 18rpx;
    background: $forest-soft;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  &__gift-target-text {
    min-width: 0;
    color: $forest;
    font-size: 23rpx;
    text-align: right;
    word-break: break-all;
  }

  &__gift-assignment {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding-top: 8rpx;
  }

  &__assignment-row {
    min-height: 102rpx;
    padding: 16rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: grid;
    grid-template-columns: minmax(180rpx, 0.72fr) minmax(260rpx, 1.28fr);
    gap: 18rpx;
    align-items: center;
  }

  &__assignment-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__assignment-picker-wrap {
    min-width: 0;
  }

  &__picker--assignment {
    min-height: 68rpx;
    padding: 15rpx 18rpx;
    text-align: right;
  }

  &__picker--invalid {
    border-color: $color-danger;
    color: $color-danger;
  }

  &__empty {
    min-height: 150rpx;
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__empty-icon {
    font-size: 34rpx;
  }

  &__error-list {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__error {
    color: $color-danger;
    font-size: 22rpx;
  }

  &__weight-row,
  &__result-row {
    min-height: 88rpx;
    padding: 14rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  &__weight-name {
    flex: 1;
    min-width: 0;
    font-size: 26rpx;
    word-break: break-all;
  }

  &__summary-band {
    color: $forest;
    font-size: 26rpx;
  }

  &__screen--draw,
  &__screen--result {
    gap: 24rpx;
  }

  &__draw-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    text-align: center;
  }

  &__draw-badge,
  &__source {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42rpx;
    padding: 0 16rpx;
    border-radius: 24rpx;
    background: $forest-soft;
    color: $forest;
    font-size: 21rpx;
  }

  &__round-summary {
    padding: 18rpx 20rpx;
    border-left: 6rpx solid $forest;
    background: $forest-soft;
    color: $forest;
    font-size: 23rpx;
    line-height: 1.55;
  }

  &__draw-stage {
    position: relative;
    min-height: 560rpx;
    padding: 36rpx 20rpx 30rpx;
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 14rpx;
  }

  &__sticks {
    height: 174rpx;
    display: flex;
    align-items: flex-end;
    gap: 8rpx;
    transform-origin: center bottom;
  }

  &__sticks text {
    width: 44rpx;
    height: 164rpx;
    padding-top: 16rpx;
    border: 2rpx solid #d9c5ac;
    border-radius: 10rpx 10rpx 0 0;
    background: #fffdf9;
    color: $maple-dark;
    font-size: 24rpx;
    text-align: center;
    box-sizing: border-box;
  }

  &__sticks text:nth-child(2),
  &__sticks text:nth-child(4) {
    height: 148rpx;
  }

  &__sticks text:nth-child(3) {
    height: 174rpx;
  }

  &__tube {
    width: 270rpx;
    min-height: 198rpx;
    margin-top: -24rpx;
    margin-bottom: 12rpx;
    padding: 50rpx 20rpx 22rpx;
    border: 3rpx solid #d8bba5;
    border-radius: 18rpx 18rpx 28rpx 28rpx;
    background: linear-gradient(145deg, #f4d7cb, #e8b9a7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10rpx;
    box-sizing: border-box;
  }

  &__tube-leaf {
    font-size: 50rpx;
  }

  &__tube-name {
    font-size: 26rpx;
    font-weight: 700;
    color: $maple-dark;
  }

  &__rolling {
    min-height: 58rpx;
    max-width: 100%;
    font-size: 38rpx;
    font-weight: 700;
    color: $ink;
    text-align: center;
    word-break: break-all;
  }

  &__draw-hint {
    min-height: 36rpx;
    font-size: 23rpx;
    color: $color-text-secondary;
    text-align: center;
  }

  &__falling-leaf {
    position: absolute;
    opacity: 0;
    font-size: 30rpx;
  }

  &__falling-leaf--one { left: 12%; top: 18%; }
  &__falling-leaf--two { right: 13%; top: 25%; }
  &__falling-leaf--three { right: 24%; top: 40%; }

  &__draw-stage--running &__sticks,
  &__draw-stage--running &__tube {
    animation: maple-shake 170ms ease-in-out 8 alternate;
  }

  &__draw-stage--running &__falling-leaf {
    animation: maple-fall 800ms ease-out 2;
  }

  &__draw-stage--running &__falling-leaf--two { animation-delay: 120ms; }
  &__draw-stage--running &__falling-leaf--three { animation-delay: 220ms; }

  &__result-leaves {
    display: flex;
    justify-content: center;
    gap: 28rpx;
    font-size: 34rpx;
  }

  &__result-leaves text:nth-child(2) {
    transform: translateY(-12rpx);
  }

  &__result-hero {
    padding: 36rpx 16rpx;
    border-top: 2rpx solid $color-border;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    text-align: center;
  }

  &__result-kicker {
    font-size: 24rpx;
    color: $color-text-secondary;
  }

  &__result-main {
    max-width: 100%;
    font-size: 48rpx;
    font-weight: 700;
    color: $ink;
    word-break: break-all;
  }

  &__result-detail {
    font-size: 24rpx;
    color: $forest;
  }

  &__result-index {
    width: 50rpx;
    color: $color-text-secondary;
    font-size: 23rpx;
    flex-shrink: 0;
  }

  &__result-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5rpx;
  }

  &__result-name {
    font-size: 27rpx;
    font-weight: 600;
    color: $ink;
  }

  &__result-name--wide {
    flex: 1;
    min-width: 0;
    word-break: break-all;
  }

  &__source {
    background: $forest-soft;
    flex-shrink: 0;
  }

  &__source--special {
    background: $maple-soft;
    color: $maple-dark;
  }

  &__history-row {
    min-height: 122rpx;
    padding: 20rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    align-items: center;
    gap: 18rpx;
  }

  &__history-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7rpx;
  }

  &__history-title-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
  }

  &__history-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    color: $ink;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__history-mode {
    padding: 5rpx 10rpx;
    border-radius: $radius-sm;
    background: $forest-soft;
    color: $forest;
    font-size: 20rpx;
    flex-shrink: 0;
  }

  &__history-meta,
  &__history-rule {
    font-size: 22rpx;
    color: $color-text-secondary;
    word-break: break-all;
  }

  &__history-rule {
    color: $forest;
  }

  &__history-copy-btn {
    min-width: 68rpx;
    padding: 12rpx 0;
    color: $maple-dark;
    font-size: 24rpx;
    font-weight: 600;
    text-align: right;
    flex-shrink: 0;
  }

  &__group {
    padding: 22rpx 0;
    border-bottom: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  &__group-name {
    font-size: 28rpx;
    font-weight: 700;
    color: $forest;
  }

  &__group-members {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  &__group-members text {
    padding: 10rpx 16rpx;
    border-radius: $radius-sm;
    background: $forest-soft;
    color: $forest;
    font-size: 24rpx;
  }

  &__footer--result {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  &__footer--result &__primary-btn:only-child {
    grid-column: 1 / -1;
  }

  &__copy-btn {
    width: 100%;
  }
}

@keyframes maple-shake {
  from { transform: translateX(-8rpx) rotate(-2deg); }
  to { transform: translateX(8rpx) rotate(2deg); }
}

@keyframes maple-fall {
  0% { opacity: 0; transform: translateY(-16rpx) rotate(0deg); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: translateY(150rpx) rotate(170deg); }
}
</style>
