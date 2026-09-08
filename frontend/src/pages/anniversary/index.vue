<template>
  <view class="anniversary">
    <!-- 自定义导航：非列表态（卡片/编辑/邀请）先回列表，列表态才退出页面 -->
    <AppNavBar :bleed="32" @back="goBack" />

    <view class="anniversary__header">
      <view class="anniversary__header-copy">
        <text class="anniversary__eyebrow">时光纪念卡</text>
        <text class="anniversary__title">{{ headerTitle }}</text>
      </view>
      <view class="anniversary__header-action" @tap="openCreate()">新建</view>
    </view>

    <view v-if="loading" class="anniversary__loading">正在读取重要日子…</view>

    <template v-else>
      <!-- ===== 共享邀请接受面板 ===== -->
      <view v-if="panel === 'invite' && invitePreview" class="anniversary__invite card">
        <text class="anniversary__invite-eyebrow">收到共享邀请</text>
        <image
          v-if="invitePreview.inviter.avatarUrl"
          class="anniversary__invite-avatar"
          :src="invitePreview.inviter.avatarUrl"
          mode="aspectFill"
        />
        <view v-else class="anniversary__invite-avatar anniversary__invite-avatar--placeholder">🍁</view>
        <text class="anniversary__invite-title">{{ invitePreview.event.title }}</text>
        <text class="caption">{{ invitePreview.inviter.nickname || '好友' }} 邀你一起记住 {{ invitePreview.event.eventDate.replace(/-/g, '.') }} 的这个日子</text>
        <view class="anniversary__invite-role" :class="'anniversary__invite-role--' + invitePreview.role">
          <text class="anniversary__invite-role-title">{{ invitePreview.role === 'editor' ? '✏️ 可以一起编辑' : '👀 仅查看' }}</text>
          <text class="caption">{{ invitePreview.role === 'editor' ? '能改名称和日期，不能删除或邀请别人' : '只能查看，提醒和卡片偏好仍归你自己' }}</text>
        </view>
        <view class="anniversary__invite-actions">
          <view class="btn-ghost anniversary__invite-btn" @tap="declineInvite">暂不</view>
          <view class="btn-primary anniversary__invite-btn" :class="{ disabled: inviteAccepting }" @tap="acceptInvite">
            {{ inviteAccepting ? '接受中…' : '接受邀请' }}
          </view>
        </view>
        <text class="caption anniversary__invite-expire">邀请码一次性有效 · 24 小时内有效</text>
      </view>

      <!-- ===== 列表页 ===== -->
      <template v-if="panel === 'home'">
        <AppEmpty v-if="events.length === 0" class="card" title="还没有记录重要日子" hint="从生日、旅行、纪念日或坚持一件事开始。">
          <view class="btn-primary anniversary__empty-action" @tap="openCreate()">记录第一个日子</view>
        </AppEmpty>

        <template v-else>
          <!-- hero + 统计：全局仪表盘（三个 tab 常驻），搜索时收起 -->
          <template v-if="!searching">
            <view
              v-if="summary.nextEvent"
              class="anniversary__hero"
              :class="['anniversary__hero--' + summary.nextEvent.sceneType, { 'anniversary__hero--today': heroIsToday }]"
            >
              <view class="anniversary__hero-top">
                <view class="anniversary__hero-scene">{{ heroIsToday ? '🎉 ' : '' }}{{ sceneName(summary.nextEvent.sceneType) }}</view>
                <text class="anniversary__hero-kicker">{{ heroIsToday ? '就是今天' : '下一个重要日子' }}</text>
              </view>
              <view class="anniversary__hero-title">{{ summary.nextEvent.title }}</view>
              <view class="anniversary__hero-number">
                <text class="anniversary__hero-days">{{ heroDaysText }}</text>
                <text v-if="heroUnit" class="anniversary__hero-unit">{{ heroUnit }}</text>
              </view>
              <text class="anniversary__hero-detail">{{ computeOccurrence(summary.nextEvent).detail }}</text>
              <view v-if="heroMilestone" class="anniversary__hero-milestone">
                <view class="anniversary__hero-milestone-head">
                  <text>{{ heroMilestone.label }}里程碑</text>
                  <text class="anniversary__hero-milestone-pct">{{ heroMilestonePercent }}%</text>
                </view>
                <view class="anniversary__hero-milestone-track">
                  <view class="anniversary__hero-milestone-bar" :style="{ width: heroMilestonePercent + '%' }" />
                </view>
              </view>
              <view class="anniversary__hero-actions">
                <view class="anniversary__hero-btn" @tap="addToCalendar(summary.nextEvent)">📅 写入日历</view>
                <view class="anniversary__hero-btn" @tap="openCard(summary.nextEvent)">{{ heroIsToday ? '✨ 马上纪念' : '✨ 生成卡片' }}</view>
              </view>
            </view>

            <view class="anniversary__stats">
              <view class="anniversary__stat card">
                <text class="anniversary__stat-value">{{ summary.todayCount }}</text>
                <text class="caption">今天</text>
              </view>
              <view class="anniversary__stat card">
                <text class="anniversary__stat-value">{{ summary.upcomingCount }}</text>
                <text class="caption">7 天内</text>
              </view>
              <view class="anniversary__stat card">
                <text class="anniversary__stat-value">{{ summary.nextMilestone?.remainingDays ?? '-' }}</text>
                <text class="caption">天到里程碑</text>
              </view>
            </view>
          </template>

          <!-- 吸顶组：tab + 搜索（搜索时 tab 让位给结果条；场景 chips 不吸顶） -->
          <view class="anniversary__sticky">
            <view v-if="!searching" class="anniversary__tabs">
              <view
                v-for="tab in timeTabs"
                :key="tab.key"
                class="anniversary__tab"
                :class="{ 'anniversary__tab--active': activeTab === tab.key }"
                @tap="switchTab(tab.key)"
              >
                <text class="anniversary__tab-label">{{ tab.name }}</text>
                <text class="anniversary__tab-count">{{ tab.count }}</text>
              </view>
            </view>
            <view class="anniversary__search-row" :class="{ 'anniversary__search-row--active': searching }">
              <input v-model="searchQuery" class="anniversary__search" placeholder="搜索纪念日…" maxlength="40" />
              <view v-if="searchQuery" class="anniversary__search-clear" @tap="searchQuery = ''">×</view>
            </view>
          </view>

          <!-- 场景筛选：tab 内二级筛选 -->
          <scroll-view v-if="!searching" scroll-x class="anniversary__scene-filter">
            <view
              v-for="scene in filterSceneOptions"
              :key="scene.key"
              class="anniversary__scene-chip"
              :class="[
                filterScene === scene.key ? 'anniversary__scene-chip--active' : '',
                scene.key ? 'anniversary__scene-chip--c-' + scene.key : '',
              ]"
              @tap="filterScene = filterScene === scene.key ? '' : scene.key"
            >
              <view v-if="scene.key" class="anniversary__chip-dot" :class="'anniversary__chip-dot--' + scene.key" />
              {{ scene.name }}
            </view>
          </scroll-view>

          <!-- 搜索模式：跨全部分组，结果带来源 -->
          <template v-if="searching">
            <view class="anniversary__resultbar">
              <text class="anniversary__resultbar-text">搜索结果 {{ searchResults.length }} · 跨全部分组</text>
            </view>
            <AppSection v-if="searchResults.length">
              <view
                v-for="item in searchResults"
                :key="`sr-${item.event.id}`"
                class="anniversary__event card"
                @tap="openCard(item.event)"
              >
                <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + item.event.sceneType" />
                <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + item.event.sceneType">
                  <text class="anniversary__date-badge-month">{{ badgeMonth(item.event) }}</text>
                  <text class="anniversary__date-badge-day">{{ badgeDay(item.event) }}</text>
                </view>
                <view class="anniversary__event-body">
                  <view class="anniversary__event-title-row">
                    <text class="anniversary__event-title">{{ item.event.title }}</text>
                    <text v-if="item.event.shared" class="anniversary__event-shared-badge">👥 {{ item.event.memberCount }}</text>
                  </view>
                  <text class="caption">{{ eventDateLabel(item.event) }} · {{ occOf(item.event).label }}</text>
                </view>
                <text class="anniversary__src-pill">{{ item.sourceName }} ›</text>
              </view>
            </AppSection>
            <AppEmpty v-else inline title="没有找到匹配的纪念日" />
          </template>

          <!-- 即将到来：今天 / 7 天内 / 更晚 / 正计时 -->
          <template v-else-if="activeTab === 'soon'">
            <AppEmpty v-if="groups.counts.soon === 0" inline icon="🍁" title="近期没有待到来的日子" />
            <template v-else>
              <AppSection v-if="groups.today.length" title="今天" :count="groups.today.length + ' 个'">
                <view
                  v-for="event in groups.today"
                  :key="`today-${event.id}`"
                  class="anniversary__event card"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                      <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · {{ occOf(event).detail }}</text>
                  </view>
                  <text class="anniversary__event-count" :class="'anniversary__event-count--' + event.sceneType">今天</text>
                </view>
              </AppSection>

              <AppSection v-if="groups.week.length" title="7 天内" :count="groups.week.length + ' 个'">
                <view
                  v-for="event in groups.week"
                  :key="`week-${event.id}`"
                  class="anniversary__event card"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                      <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · {{ occOf(event).detail }}</text>
                  </view>
                  <text class="anniversary__event-count" :class="'anniversary__event-count--' + event.sceneType">{{ occOf(event).daysUntil }} 天</text>
                </view>
              </AppSection>

              <AppSection v-if="groups.later.length" title="更晚" :count="groups.later.length + ' 个'">
                <view
                  v-for="event in laterShown"
                  :key="`later-${event.id}`"
                  class="anniversary__event card"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                      <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · {{ occOf(event).detail }}</text>
                  </view>
                  <text class="anniversary__event-count" :class="'anniversary__event-count--' + event.sceneType">{{ occOf(event).daysUntil }} 天</text>
                </view>
                <view v-if="groups.later.length > laterShown.length" class="anniversary__loadmore">
                  <text>已显示 {{ laterShown.length }} / {{ groups.later.length }} · 继续下滑自动加载</text>
                </view>
              </AppSection>

              <AppSection v-if="groups.counting.length" title="在一起的日子" :count="groups.counting.length + ' 个'">
                <view
                  v-for="event in groups.counting"
                  :key="`counting-${event.id}`"
                  class="anniversary__event card"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                      <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · {{ occOf(event).label }}</text>
                  </view>
                  <text class="anniversary__event-count" :class="'anniversary__event-count--' + event.sceneType">第 {{ occOf(event).elapsedDays }} 天</text>
                </view>
              </AppSection>
            </template>
          </template>

          <!-- 今年已过：周年事件等明年，附明年日期 -->
          <template v-else-if="activeTab === 'past'">
            <AppEmpty v-if="groups.past.length === 0" inline icon="🍂" title="今年还没有过完的日子" />
            <AppSection v-else title="今年已过" :count="groups.past.length + ' 个 · 刚过的在前'">
              <view
                v-for="event in pastShown"
                :key="`past-${event.id}`"
                class="anniversary__event card"
                @tap="openCard(event)"
              >
                <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                  <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                  <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                </view>
                <view class="anniversary__event-body">
                  <view class="anniversary__event-title-row">
                    <text class="anniversary__event-title">{{ event.title }}</text>
                    <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                    <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                  </view>
                  <text class="caption">{{ nextOccurrenceLabel(event) }}</text>
                </view>
                <text class="anniversary__event-count anniversary__event-count--muted">{{ passedDaysText(event) }}</text>
              </view>
              <view v-if="groups.past.length > pastShown.length" class="anniversary__loadmore">
                <text>已显示 {{ pastShown.length }} / {{ groups.past.length }} · 继续下滑自动加载</text>
              </view>
            </AppSection>
          </template>

          <!-- 不重复：倒数中 / 已完成 -->
          <template v-else>
            <AppEmpty v-if="groups.counts.once === 0" inline icon="✏️" title="还没有一次性事件" />
            <template v-else>
              <AppSection v-if="groups.onceActive.length" title="倒数中" :count="groups.onceActive.length + ' 个'">
                <view
                  v-for="event in onceActiveShown"
                  :key="`once-${event.id}`"
                  class="anniversary__event card"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                      <text v-else-if="event.calendarAddedAt" class="anniversary__event-reminder-badge">已加入提醒</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · 一次性</text>
                  </view>
                  <text class="anniversary__event-count" :class="'anniversary__event-count--' + event.sceneType">
                    {{ occOf(event).daysUntil === 0 ? '今天' : occOf(event).daysUntil + ' 天' }}
                  </text>
                </view>
                <view v-if="groups.onceActive.length > onceActiveShown.length" class="anniversary__loadmore">
                  <text>已显示 {{ onceActiveShown.length }} / {{ groups.onceActive.length }} · 继续下滑自动加载</text>
                </view>
              </AppSection>

              <AppSection v-if="groups.onceDone.length" title="已完成" :count="groups.onceDone.length + ' 个 · 不再提醒'">
                <view
                  v-for="event in onceDoneShown"
                  :key="`done-${event.id}`"
                  class="anniversary__event card anniversary__event--done"
                  @tap="openCard(event)"
                >
                  <view class="anniversary__event-bar" :class="'anniversary__event-bar--' + event.sceneType" />
                  <view class="anniversary__date-badge" :class="'anniversary__date-badge--' + event.sceneType">
                    <text class="anniversary__date-badge-month">{{ badgeMonth(event) }}</text>
                    <text class="anniversary__date-badge-day">{{ badgeDay(event) }}</text>
                  </view>
                  <view class="anniversary__event-body">
                    <view class="anniversary__event-title-row">
                      <text class="anniversary__event-title">{{ event.title }}</text>
                      <text v-if="event.shared" class="anniversary__event-shared-badge">👥 {{ event.memberCount }}</text>
                    </view>
                    <text class="caption">{{ eventDateLabel(event) }} · 一次性</text>
                  </view>
                  <text class="anniversary__event-count anniversary__event-count--muted">{{ passedDaysText(event) }}</text>
                </view>
                <view v-if="groups.onceDone.length > onceDoneShown.length" class="anniversary__loadmore">
                  <text>已显示 {{ onceDoneShown.length }} / {{ groups.onceDone.length }} · 继续下滑自动加载</text>
                </view>
              </AppSection>
            </template>
          </template>
        </template>
      </template>

      <!-- ===== 编辑页 ===== -->
      <template v-else-if="panel === 'form'">
        <view class="anniversary__scene-grid">
          <view
            v-for="scene in SCENE_OPTIONS"
            :key="scene.key"
            class="anniversary__scene-cell"
            :class="[
              { 'anniversary__scene-cell--active': form.sceneType === scene.key },
              'anniversary__scene-cell--c-' + scene.key,
            ]"
            @tap="selectScene(scene.key)"
          >
            <text class="anniversary__scene-cell-icon">{{ SCENE_ICONS[scene.key] }}</text>
            <text class="anniversary__scene-cell-name">{{ scene.name }}</text>
          </view>
        </view>

        <view class="anniversary__form card">
          <text class="section-title">基本信息</text>
          <view class="anniversary__field">
            <text class="caption">名称</text>
            <input v-model="form.title" class="anniversary__input" maxlength="80" placeholder="这个日子叫什么" />
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.calendarType === 'solar' }" @tap="setCalendarType('solar')">公历</view>
            <view :class="{ active: form.calendarType === 'lunar' }" @tap="setCalendarType('lunar')">农历</view>
          </view>

          <view v-if="form.calendarType === 'solar'" class="anniversary__field">
            <text class="caption">日期</text>
            <picker mode="date" :value="form.eventDate" @change="onSolarDateChange">
              <view class="anniversary__picker">{{ form.eventDate }}</view>
            </picker>
          </view>

          <view v-else class="anniversary__lunar-grid">
            <view class="anniversary__field">
              <text class="caption">农历年</text>
              <picker mode="selector" :range="lunarYearLabels" :value="lunarYearIndex" @change="onLunarYearChange">
                <view class="anniversary__picker">{{ form.lunarYear }} 年</view>
              </picker>
            </view>
            <view class="anniversary__field">
              <text class="caption">农历月</text>
              <picker mode="selector" :range="lunarMonthLabels" :value="lunarMonthIndex" @change="onLunarMonthChange">
                <view class="anniversary__picker">{{ currentLunarMonthLabel }}</view>
              </picker>
            </view>
            <view class="anniversary__field">
              <text class="caption">农历日</text>
              <picker mode="selector" :range="lunarDayLabels" :value="lunarDayIndex" @change="onLunarDayChange">
                <view class="anniversary__picker">{{ currentLunarDayLabel }}</view>
              </picker>
            </view>
            <text class="caption anniversary__lunar-hint">对应公历：{{ form.eventDate }}</text>
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.countMode === 'countdown' }" @tap="form.countMode = 'countdown'">倒数</view>
            <view :class="{ active: form.countMode === 'countup' }" @tap="form.countMode = 'countup'">正计时</view>
          </view>

          <view class="anniversary__segmented">
            <view :class="{ active: form.repeatType === 'none' }" @tap="form.repeatType = 'none'">不重复</view>
            <view :class="{ active: form.repeatType === 'yearly' }" @tap="form.repeatType = 'yearly'">每年重复</view>
          </view>
        </view>

        <view class="anniversary__form card">
          <text class="section-title">提醒与卡片</text>
          <view class="anniversary__field">
            <text class="caption">日历提醒</text>
            <picker mode="selector" :range="remindLabels" :value="remindIndex" @change="onRemindChange">
              <view class="anniversary__picker">{{ remindLabels[remindIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__field">
            <text class="caption">提醒时刻 · 写入日历的具体时间</text>
            <view class="anniversary__time-row">
              <view
                v-for="preset in REMINDER_TIME_PRESETS"
                :key="preset"
                class="anniversary__time-chip"
                :class="{ 'anniversary__time-chip--active': form.remindTime === preset }"
                @tap="form.remindTime = preset"
              >
                {{ preset }}
              </view>
              <picker mode="time" :value="form.remindTime" @change="onRemindTimeChange">
                <view
                  class="anniversary__time-chip anniversary__time-chip--custom"
                  :class="{ 'anniversary__time-chip--active': !REMINDER_TIME_PRESETS.includes(form.remindTime as never) }"
                >
                  {{ REMINDER_TIME_PRESETS.includes(form.remindTime as never) ? '自定义' : form.remindTime }}
                </view>
              </picker>
            </view>
          </view>

          <view class="anniversary__field">
            <text class="caption">默认模板</text>
            <picker mode="selector" :range="templateLabels" :value="templateIndex" @change="onTemplateChange">
              <view class="anniversary__picker">{{ templateLabels[templateIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__field">
            <text class="caption">卡片风格</text>
            <picker mode="selector" :range="toneLabels" :value="toneIndex" :key="'tone-' + (form.id || 0)" @change="onToneChange">
              <view class="anniversary__picker">{{ toneLabels[toneIndex] }}</view>
            </picker>
          </view>

          <view class="anniversary__cover" @tap="chooseCoverForForm">
            <view v-if="form.coverImage" class="anniversary__cover-image-wrap">
              <image class="anniversary__cover-image" :src="form.coverImage" mode="aspectFit" />
              <view class="anniversary__cover-remove" @tap.stop="removeCover">✕</view>
            </view>
            <view v-else class="anniversary__cover-empty">
              <text>添加本机封面图</text>
              <text class="caption">设为卡片背景，让纪念卡更有温度</text>
            </view>
          </view>
        </view>

        <view class="anniversary__actions">
          <view class="btn-ghost anniversary__action" @tap="goHome">取消</view>
          <view class="btn-primary anniversary__action" :class="{ disabled: saving }" @tap="saveForm">保存</view>
        </view>
      </template>

      <!-- ===== 卡片页 ===== -->
      <template v-else-if="panel === 'card' && cardEvent">
        <view v-if="previewImage" class="anniversary__canvas-preview card">
          <image class="anniversary__canvas-preview-image" :src="previewImage" mode="widthFix" />
          <view v-if="previewRendering" class="anniversary__canvas-preview-state caption">正在更新预览…</view>
        </view>

        <view
          v-else
          class="anniversary__card-preview"
          :class="[
            'anniversary__card-preview--' + cardTone,
            'anniversary__card-preview--' + cardTemplate,
            { 'anniversary__card-preview--has-cover': hasCoverBackground, 'anniversary__card-preview--photo-bg': usesPhotoBackground },
          ]"
          :key="previewCardKey"
        >
          <view v-if="cardCoverImage" class="anniversary__preview-bg-wrap">
            <image class="anniversary__preview-bg" :src="cardCoverImage" mode="aspectFill" />
            <view class="anniversary__preview-overlay" />
          </view>
          <view v-if="cardTemplate === 'photo'" class="anniversary__preview-media">
            <image v-if="cardCoverImage" :src="cardCoverImage" mode="aspectFill" />
            <text v-else>📷</text>
          </view>
          <view v-if="cardTemplate === 'festival'" class="anniversary__preview-ribbon">今天值得被记住</view>

          <view class="anniversary__preview-labels">
            <text class="anniversary__preview-label">{{ templateName(cardTemplate) }}</text>
            <text class="anniversary__preview-label anniversary__preview-label--tone">{{ toneName(cardTone) }}</text>
          </view>
          <view class="anniversary__preview-number">
            <text>{{ previewNumber }}</text>
            <text class="anniversary__preview-unit">{{ previewUnit }}</text>
          </view>
          <text class="anniversary__preview-title">{{ cardEvent.title }}</text>
          <text class="anniversary__preview-copy">{{ defaultCopyForEvent(cardEvent) }}</text>
          <text class="anniversary__preview-date">{{ eventDateLabel(cardEvent) }}</text>

          <view v-if="cardTemplate === 'certificate'" class="anniversary__preview-stamp">纪</view>
          <view v-if="cardTemplate === 'progress'" class="anniversary__preview-ring-wrap">
            <view class="anniversary__preview-ring" />
            <text class="anniversary__preview-ring-text">{{ previewNumber }}</text>
          </view>
          <template v-if="cardTemplate === 'festival'">
            <view class="anniversary__preview-spark" style="top: 150rpx; right: 120rpx;" />
            <view class="anniversary__preview-spark" style="top: 240rpx; right: 220rpx; opacity: 0.3;" />
            <view class="anniversary__preview-dot" style="top: 190rpx; right: 90rpx;" />
            <view class="anniversary__preview-dot" style="top: 300rpx; right: 300rpx;" />
          </template>
        </view>

        <view v-if="cardEvent.calendarAddedAt" class="anniversary__reminder-status card">
          <text>📅 已写入手机日历</text>
          <text class="caption">
            {{ cardEvent.remindDaysBefore > 0 ? `提前 ${cardEvent.remindDaysBefore} 天` : '当天' }} {{ cardEvent.remindTime || '09:00' }} 提醒
          </text>
        </view>

        <view v-if="cardEvent.shared" class="anniversary__shared-bar card">
          <text class="anniversary__shared-bar-main">👥 {{ cardEvent.memberCount }} 人一起记录这个日子</text>
          <text class="caption">{{ cardEvent.role === 'owner' ? '你是创建者' : cardEvent.role === 'editor' ? '你有编辑权限' : '你只有查看权限' }}</text>
        </view>

        <AppSection title="模板" count="保存图片时使用">
          <view class="anniversary__tpl-grid">
            <view
              v-for="template in TEMPLATE_OPTIONS"
              :key="template.key"
              class="anniversary__tpl"
              :class="[
                { 'anniversary__tpl--active': cardTemplate === template.key },
                'anniversary__tpl-thumb--' + template.key,
              ]"
              @tap="selectCardTemplate(template.key)"
            >
              <view class="anniversary__tpl-thumb">
                <view class="anniversary__tpl-thumb-num">30</view>
                <text class="anniversary__tpl-thumb-name">{{ template.name }}</text>
              </view>
            </view>
          </view>
        </AppSection>

        <AppSection title="风格" :count="toneName(cardTone) + ' · ' + toneHint(cardTone)">
          <view class="anniversary__tone-row">
            <view
              v-for="tone in TONE_OPTIONS"
              :key="tone.key"
              class="anniversary__tone"
              :class="[
                { 'anniversary__tone--active': cardTone === tone.key },
                'anniversary__tone-swatch--' + tone.key,
              ]"
              @tap="selectCardTone(tone.key)"
            >
              <view class="anniversary__tone-swatch" :class="'anniversary__tone-swatch--' + tone.key" />
              <text>{{ tone.name }}</text>
            </view>
          </view>
        </AppSection>

        <view class="anniversary__bottom-space" />

        <!-- 底部固定操作条：更多 / 分享 / 保存图片 -->
        <view class="anniversary__bottom-bar">
          <view class="anniversary__bottom-btn" @tap="moreSheetOpen = true">⋯</view>
          <view class="anniversary__bottom-btn" @tap="shareCard">↗</view>
          <view class="anniversary__bottom-cta" :class="{ disabled: exporting }" @tap="exportCard">
            {{ exporting ? '生成中…' : '保存图片' }}
          </view>
        </view>

        <!-- 「更多」底部面板 -->
        <view v-if="moreSheetOpen" class="anniversary__sheet-mask" @tap="moreSheetOpen = false">
          <view class="anniversary__sheet" @tap.stop>
            <view class="anniversary__sheet-grabber" />
            <text class="anniversary__sheet-title">更多操作</text>
            <view
              v-for="action in moreActions"
              :key="action.key"
              class="anniversary__sheet-item"
              :class="{ 'anniversary__sheet-item--danger': action.danger }"
              @tap="handleMoreAction(action.key)"
            >
              <view class="anniversary__sheet-icon">{{ action.icon }}</view>
              <view class="anniversary__sheet-texts">
                <text class="anniversary__sheet-item-title">{{ action.title }}</text>
                <text class="caption">{{ action.sub }}</text>
              </view>
              <text class="anniversary__sheet-chevron">›</text>
            </view>
          </view>
        </view>

        <!-- 邀请面板 -->
        <AnniversaryInviteSheet
          v-if="inviteSheetOpen && selectedEvent"
          :event-id="selectedEvent.id"
          :event-title="selectedEvent.title"
          @close="inviteSheetOpen = false"
          @created="onInviteCreated"
        />

        <!-- 成员管理面板 -->
        <AnniversaryMembersPanel
          v-if="membersPanelOpen && selectedEvent"
          :event-id="selectedEvent.id"
          @close="membersPanelOpen = false"
          @changed="loadEvents"
          @left="onLeftSharedEvent"
        />
      </template>
    </template>

    <canvas id="anniversary-export-canvas" type="2d" class="anniversary__export-canvas" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, reactive, ref } from 'vue'
import { onLoad, onReachBottom, onShareAppMessage, onShow } from '@dcloudio/uni-app'
import type {
  AnniversaryCalendarType,
  AnniversaryCardTemplate,
  AnniversaryCardTone,
  AnniversaryDraft,
  AnniversaryEvent,
  AnniversaryInvitePreview,
  AnniversarySceneType,
} from '@/types/anniversary'
import {
  acceptAnniversaryInvite,
  deleteAnniversary,
  fetchAnniversaries,
  markAnniversaryCalendarAdded,
  previewAnniversaryInvite,
  saveAnniversary,
  saveAnniversaryMyPrefs,
  subscribeAnniversaryReminder,
} from '@/services/anniversary'
import {
  REMINDER_TIME_PRESETS,
  SCENE_OPTIONS,
  TEMPLATE_OPTIONS,
  TONE_OPTIONS,
  buildCalendarEventTimes,
  computeOccurrence,
  dateFromString,
  daysSinceLastOccurrence,
  defaultCopyForEvent,
  draftFromEvent,
  emptyAnniversaryDraft,
  eventDateLabel,
  formatDate,
  groupAnniversaryEvents,
  nextMilestoneForEvent,
  recommendedTemplateForScene,
  sceneName,
  summarizeAnniversaries,
  timeStatusOf,
} from '@/utils/anniversary'
import { lunarDayLabel, lunarLeapDays, lunarLeapMonth, lunarMonthDays, lunarMonthLabel, lunarToSolar, solarToLunar } from '@/utils/lunar'
import { canvasToFile, chooseImage, getCanvasNode, openAuthSetting, saveImageToAlbum } from '@/utils/canvasAdapter'
import { renderAnniversaryCard } from '@/utils/anniversaryCard'
import AnniversaryInviteSheet from '@/components/AnniversaryInviteSheet.vue'
import AnniversaryMembersPanel from '@/components/AnniversaryMembersPanel.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNavBar from '@/components/AppNavBar.vue'
import AppSection from '@/components/AppSection.vue'

type Panel = 'home' | 'form' | 'card' | 'invite'

const SCENE_ICONS: Record<AnniversarySceneType, string> = {
  birthday: '🎂',
  relationship: '❤️',
  wedding: '💍',
  travel: '✈️',
  deadline: '📝',
  baby: '🍼',
  habit: '💪',
  custom: '✏️',
}

const instance = getCurrentInstance()?.proxy
function goBack() {
  if (panel.value !== 'home') {
    panel.value = 'home'
    return
  }
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/home/index' })
  }
}
const events = ref<AnniversaryEvent[]>([])
const loading = ref(true)
const saving = ref(false)
const exporting = ref(false)
const panel = ref<Panel>('home')
const form = ref<AnniversaryDraft>(emptyAnniversaryDraft())
const selectedId = ref<number | null>(null)
const cardTemplate = ref<AnniversaryCardTemplate>('minimal')
const cardTone = ref<AnniversaryCardTone>('warm')
const cardCoverImage = ref('')
const previewImage = ref('')
const previewRendering = ref(false)
let previewRenderSeq = 0

// 共享协作状态
const moreSheetOpen = ref(false)
const inviteSheetOpen = ref(false)
const membersPanelOpen = ref(false)
const invitePreview = ref<AnniversaryInvitePreview | null>(null)
const inviteAccepting = ref(false)
const activeInvite = ref<{ code: string, role: 'editor' | 'viewer' } | null>(null)

const remindValues = [0, 1, 3, 7, 14, 30]
const remindLabels = ['当天提醒', '提前 1 天', '提前 3 天', '提前 7 天', '提前 14 天', '提前 30 天']
const lunarYears = Array.from({ length: 201 }, (_, index) => 1900 + index)
const lunarYearLabels = lunarYears.map((year) => `${year} 年`)

const summary = computed(() => summarizeAnniversaries(events.value))
const heroIsToday = computed(() => {
  if (!summary.value.nextEvent) return false
  return computeOccurrence(summary.value.nextEvent).daysUntil === 0
})
const heroOccurrence = computed(() => summary.value.nextEvent ? computeOccurrence(summary.value.nextEvent) : null)
const heroDaysText = computed(() => {
  const occurrence = heroOccurrence.value
  if (!occurrence || !summary.value.nextEvent) return ''
  if (summary.value.nextEvent.countMode === 'countup') {
    return occurrence.elapsedDays > 0 ? String(occurrence.elapsedDays) : '还没开始'
  }
  return occurrence.daysUntil === 0 ? '今天' : String(occurrence.daysUntil)
})
const heroUnit = computed(() => {
  const occurrence = heroOccurrence.value
  if (!occurrence || !summary.value.nextEvent) return ''
  if (summary.value.nextEvent.countMode === 'countup') return occurrence.elapsedDays > 0 ? '天' : ''
  return occurrence.daysUntil === 0 ? '' : '天'
})
const heroMilestone = computed(() => summary.value.nextEvent ? nextMilestoneForEvent(summary.value.nextEvent) : null)
const heroMilestonePercent = computed(() => {
  const occurrence = heroOccurrence.value
  const milestone = heroMilestone.value
  if (!occurrence || !milestone) return 0
  if (milestone.targetDays <= 0) return 0
  return Math.min(100, Math.round((occurrence.elapsedDays / milestone.targetDays) * 100))
})

const previewOccurrence = computed(() => cardEvent.value ? computeOccurrence(cardEvent.value) : null)
const previewNumber = computed(() => {
  if (!previewOccurrence.value) return 0
  const { elapsedDays, daysUntil } = previewOccurrence.value
  const notStarted = cardEvent.value?.countMode === 'countup' && elapsedDays === 0
  return notStarted ? Math.max(0, daysUntil) : cardEvent.value?.countMode === 'countup' ? elapsedDays : Math.max(0, daysUntil)
})
const previewUnit = computed(() => {
  if (!previewOccurrence.value) return '天'
  const { elapsedDays, daysUntil } = previewOccurrence.value
  const notStarted = cardEvent.value?.countMode === 'countup' && elapsedDays === 0
  if (notStarted) return '天后出发'
  if (cardEvent.value?.countMode === 'countup') return '天'
  return daysUntil === 0 ? '今天' : '天'
})
// 列表：时间状态 tab 分组（即将到来 / 今年已过 / 不重复）+ 搜索跨组
type TimeTab = 'soon' | 'past' | 'once'
const TIME_TAB_NAMES: Record<TimeTab, string> = { soon: '即将到来', past: '今年已过', once: '不重复' }
const TAB_RENDER_BATCH = 30
const activeTab = ref<TimeTab>('soon')
const tabRenderLimit = reactive<Record<TimeTab, number>>({ soon: TAB_RENDER_BATCH, past: TAB_RENDER_BATCH, once: TAB_RENDER_BATCH })
const searchQuery = ref('')
const filterScene = ref('')
const filterSceneOptions = computed(() => [{ key: '' as '', name: '全部' }, ...SCENE_OPTIONS])
const searching = computed(() => searchQuery.value.trim() !== '')

// occurrence 缓存：模板里每个事件多次取值（detail/label/daysUntil）只算一次，农历换算不随渲染重复
const occurrenceById = computed(() => {
  const today = new Date()
  const map = new Map<number, ReturnType<typeof computeOccurrence>>()
  for (const event of events.value) map.set(event.id, computeOccurrence(event, today))
  return map
})
function occOf(event: AnniversaryEvent): ReturnType<typeof computeOccurrence> {
  return occurrenceById.value.get(event.id) ?? computeOccurrence(event)
}

const groups = computed(() => {
  const list = filterScene.value ? events.value.filter((event) => event.sceneType === filterScene.value) : events.value
  return groupAnniversaryEvents(list)
})
const timeTabs = computed(() => [
  { key: 'soon' as TimeTab, name: TIME_TAB_NAMES.soon, count: groups.value.counts.soon },
  { key: 'past' as TimeTab, name: TIME_TAB_NAMES.past, count: groups.value.counts.past },
  { key: 'once' as TimeTab, name: TIME_TAB_NAMES.once, count: groups.value.counts.once },
])
const laterShown = computed(() => groups.value.later.slice(0, tabRenderLimit.soon))
const pastShown = computed(() => groups.value.past.slice(0, tabRenderLimit.past))
const onceActiveShown = computed(() => groups.value.onceActive.slice(0, tabRenderLimit.once))
const onceDoneShown = computed(() => groups.value.onceDone.slice(0, tabRenderLimit.once))
const searchResults = computed(() => {
  if (!searching.value) return []
  const query = searchQuery.value.trim().toLowerCase()
  return events.value
    .filter((event) => event.title.toLowerCase().includes(query))
    .map((event) => ({ event, sourceName: TIME_TAB_NAMES[timeStatusOf(event)] }))
})
function switchTab(key: TimeTab) {
  activeTab.value = key
}
function nextOccurrenceLabel(event: AnniversaryEvent): string {
  const suffix = event.calendarType === 'lunar' ? ' · 农历估算' : ''
  return `${occOf(event).date.replace(/-/g, '.')} · 明年${suffix}`
}
function passedDaysText(event: AnniversaryEvent): string {
  const occurrence = occOf(event)
  if (event.repeatType === 'yearly') return `已过 ${daysSinceLastOccurrence(occurrence)} 天`
  return `已过 ${Math.abs(occurrence.daysUntil)} 天`
}
onReachBottom(() => {
  if (searching.value) return
  const key = activeTab.value
  const totals: Record<TimeTab, number> = {
    soon: groups.value.later.length,
    past: groups.value.past.length,
    once: Math.max(groups.value.onceActive.length, groups.value.onceDone.length),
  }
  if (totals[key] > tabRenderLimit[key]) tabRenderLimit[key] += TAB_RENDER_BATCH
})
const headerTitle = computed(() => {
  if (panel.value === 'form') return '记录重要日子'
  if (panel.value === 'card') return '生成纪念卡'
  if (panel.value === 'invite') return '共享邀请'
  return '重要日子'
})
const selectedEvent = computed(() => events.value.find((event) => event.id === selectedId.value) ?? summary.value.nextEvent ?? events.value[0] ?? null)
const cardEvent = computed<AnniversaryEvent | null>(() => selectedEvent.value ? {
  ...selectedEvent.value,
  cardTemplate: cardTemplate.value,
  cardTone: cardTone.value,
  coverImage: cardCoverImage.value,
} : null)
const hasCoverBackground = computed(() => Boolean(cardCoverImage.value))
const usesPhotoBackground = computed(() => Boolean(cardCoverImage.value && cardTemplate.value === 'photo'))
const previewCardKey = computed(() => `${selectedId.value || 0}-${cardTemplate.value}-${cardTone.value}-${cardCoverImage.value}`)
const remindIndex = computed(() => Math.max(0, remindValues.indexOf(form.value.remindDaysBefore)))
const templateLabels = computed(() => TEMPLATE_OPTIONS.map((item) => item.name))
const templateIndex = computed(() => Math.max(0, TEMPLATE_OPTIONS.findIndex((item) => item.key === form.value.cardTemplate)))
const toneLabels = computed(() => TONE_OPTIONS.map((item) => `${item.name} · ${item.hint}`))
const toneIndex = computed(() => Math.max(0, TONE_OPTIONS.findIndex((item) => item.key === form.value.cardTone)))
const lunarYearIndex = computed(() => Math.max(0, lunarYears.indexOf(form.value.lunarYear || new Date().getFullYear())))
const lunarMonthOptions = computed(() => {
  const year = form.value.lunarYear || new Date().getFullYear()
  const leap = lunarLeapMonth(year)
  const options: Array<{ month: number, isLeap: boolean, label: string }> = []
  for (let month = 1; month <= 12; month += 1) {
    options.push({ month, isLeap: false, label: lunarMonthLabel(month) })
    if (leap === month) options.push({ month, isLeap: true, label: lunarMonthLabel(month, true) })
  }
  return options
})
const lunarMonthLabels = computed(() => lunarMonthOptions.value.map((item) => item.label))
const lunarMonthIndex = computed(() => {
  const index = lunarMonthOptions.value.findIndex((item) => item.month === form.value.lunarMonth && item.isLeap === form.value.isLunarLeapMonth)
  return Math.max(0, index)
})
const lunarDayOptions = computed(() => {
  const year = form.value.lunarYear || new Date().getFullYear()
  const month = form.value.lunarMonth || 1
  const max = form.value.isLunarLeapMonth ? lunarLeapDays(year) : lunarMonthDays(year, month)
  return Array.from({ length: max || 30 }, (_, index) => index + 1)
})
const lunarDayLabels = computed(() => lunarDayOptions.value.map((day) => lunarDayLabel(day)))
const lunarDayIndex = computed(() => Math.max(0, lunarDayOptions.value.indexOf(form.value.lunarDay || 1)))
const currentLunarMonthLabel = computed(() => lunarMonthLabel(form.value.lunarMonth || 1, form.value.isLunarLeapMonth))
const currentLunarDayLabel = computed(() => lunarDayLabel(form.value.lunarDay || 1))

interface MoreAction {
  key: 'edit' | 'cover' | 'calendar' | 'wechat' | 'invite' | 'members' | 'delete'
  icon: string
  title: string
  sub: string
  danger?: boolean
}

const moreActions = computed<MoreAction[]>(() => {
  const event = selectedEvent.value
  if (!event) return []
  const actions: MoreAction[] = []
  if (event.role !== 'viewer') {
    actions.push({ key: 'edit', icon: '✏️', title: '编辑这个日子', sub: '名称、日期、场景' })
  }
  actions.push({ key: 'cover', icon: '🖼', title: '换封面图', sub: '只影响你自己的卡片' })
  actions.push({
    key: 'calendar',
    icon: '📅',
    title: '加手机日历',
    sub: `${event.remindDaysBefore > 0 ? `提前 ${event.remindDaysBefore} 天` : '当天'} ${event.remindTime || '09:00'} 提醒`,
  })
  actions.push({ key: 'wechat', icon: '🔔', title: '微信提醒', sub: '到期前推送一次' })
  if (event.role === 'owner') {
    actions.push({ key: 'invite', icon: '👥', title: '邀请共享', sub: '发给微信好友 · 一次性 · 24 小时有效' })
  }
  if (event.shared) {
    actions.push({ key: 'members', icon: '☰', title: '共享成员', sub: `${event.memberCount} 人正在一起记录` })
  }
  if (event.role === 'owner') {
    actions.push({ key: 'delete', icon: '🗑', title: '删除这个日子', sub: '所有成员将不再看到', danger: true })
  }
  return actions
})

onLoad((query) => {
  const code = typeof query?.invite === 'string' ? query.invite.trim().toLowerCase() : ''
  if (/^[a-f0-9]{8}$/.test(code)) {
    void handleInviteEntry(code)
  }
})

onShow(() => {
  void loadEvents()
})

onShareAppMessage(() => {
  if (activeInvite.value) {
    return {
      title: `邀请你一起记录「${selectedEvent.value?.title ?? '这个日子'}」`,
      path: '/pages/anniversary/index?invite=' + activeInvite.value.code,
    }
  }
  if (selectedEvent.value) {
    return {
      title: `${selectedEvent.value.title} · 时光纪念卡`,
      path: '/pages/anniversary/index',
      imageUrl: selectedEvent.value.coverImage || '',
    }
  }
  return {
    title: '时光纪念卡 — 记住每一个重要的日子',
    path: '/pages/anniversary/index',
  }
})

async function loadEvents() {
  loading.value = true
  try {
    events.value = await fetchAnniversaries()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '读取纪念日失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function handleInviteEntry(code: string) {
  pendingInviteCode = code
  try {
    invitePreview.value = await previewAnniversaryInvite(code)
    panel.value = 'invite'
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '邀请已失效或过期', icon: 'none' })
  }
}

function declineInvite() {
  invitePreview.value = null
  panel.value = 'home'
}

async function acceptInvite() {
  const preview = invitePreview.value
  if (!preview || inviteAccepting.value) return
  inviteAccepting.value = true
  try {
    // 从 onShareAppMessage path 的 query 里拿不到 code，这里保存进入时解析到的码
    const code = pendingInviteCode
    const result = await acceptAnniversaryInvite(code)
    upsertEvent(result.event)
    invitePreview.value = null
    panel.value = 'home'
    uni.showToast({ title: result.alreadyMember ? '你已在这个日子的协作列表中' : '已加入共享', icon: 'success' })
    void loadEvents()
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '接受邀请失败', icon: 'none' })
  } finally {
    inviteAccepting.value = false
  }
}

let pendingInviteCode = ''

function openCreate(sceneType: AnniversarySceneType = 'birthday') {
  form.value = emptyAnniversaryDraft(sceneType)
  selectedId.value = null
  panel.value = 'form'
}

function openEdit(event: AnniversaryEvent) {
  if (event.role === 'viewer') {
    uni.showToast({ title: '你只有查看权限，不能编辑这个日子', icon: 'none' })
    return
  }
  form.value = draftFromEvent(event)
  selectedId.value = event.id
  panel.value = 'form'
}

function goHome() {
  if (form.value.title.trim() && form.value.title.trim() !== selectedEvent.value?.title) {
    uni.showModal({
      title: '放弃编辑？',
      content: '已填写的内容还没有保存',
      confirmText: '放弃',
      success: (result) => {
        if (result.confirm) panel.value = 'home'
      },
    })
    return
  }
  panel.value = 'home'
}

function selectScene(sceneType: AnniversarySceneType) {
  form.value.sceneType = sceneType
}

function setCalendarType(type: AnniversaryCalendarType) {
  if (form.value.calendarType === type) return
  form.value.calendarType = type
  if (type === 'lunar') {
    syncLunarFromSolar()
  } else {
    applyLunarToSolar()
  }
}

function onSolarDateChange(event: { detail: { value: string } }) {
  form.value.eventDate = event.detail.value
  if (form.value.calendarType === 'lunar') syncLunarFromSolar()
}

function onLunarYearChange(event: { detail: { value: number } }) {
  form.value.lunarYear = lunarYears[event.detail.value] ?? new Date().getFullYear()
  normalizeLunarMonth()
  normalizeLunarDay()
  applyLunarToSolar()
}

function onLunarMonthChange(event: { detail: { value: number } }) {
  const option = lunarMonthOptions.value[event.detail.value]
  if (!option) return
  form.value.lunarMonth = option.month
  form.value.isLunarLeapMonth = option.isLeap
  normalizeLunarDay()
  applyLunarToSolar()
}

function onLunarDayChange(event: { detail: { value: number } }) {
  form.value.lunarDay = lunarDayOptions.value[event.detail.value] ?? 1
  applyLunarToSolar()
}

function syncLunarFromSolar() {
  const lunar = solarToLunar(dateFromString(form.value.eventDate))
  if (!lunar) return
  form.value.lunarYear = lunar.year
  form.value.lunarMonth = lunar.month
  form.value.lunarDay = lunar.day
  form.value.isLunarLeapMonth = lunar.isLeap
}

function applyLunarToSolar() {
  if (!form.value.lunarYear || !form.value.lunarMonth || !form.value.lunarDay) return
  const solar = lunarToSolar(form.value.lunarYear, form.value.lunarMonth, form.value.lunarDay, form.value.isLunarLeapMonth)
  if (!solar) return
  form.value.eventDate = formatDate(solar)
}

function normalizeLunarMonth() {
  if (!form.value.lunarMonth || form.value.lunarMonth < 1) form.value.lunarMonth = 1
  if (form.value.lunarMonth > 12) form.value.lunarMonth = 12
}

function normalizeLunarDay() {
  const max = lunarDayOptions.value[lunarDayOptions.value.length - 1] ?? 30
  if (!form.value.lunarDay || form.value.lunarDay > max) form.value.lunarDay = max
}

function onRemindChange(event: { detail: { value: number } }) {
  form.value.remindDaysBefore = remindValues[event.detail.value] ?? 1
}

function onRemindTimeChange(event: { detail: { value: string } }) {
  if (/^\d{2}:\d{2}$/.test(event.detail.value)) {
    form.value.remindTime = event.detail.value
  }
}

function onTemplateChange(event: { detail: { value: number } }) {
  const option = TEMPLATE_OPTIONS[event.detail.value]
  if (option) form.value.cardTemplate = option.key
}

function onToneChange(event: { detail: { value: number } }) {
  const option = TONE_OPTIONS[event.detail.value]
  if (option) form.value.cardTone = option.key
}

async function chooseCoverForForm() {
  try {
    form.value.coverImage = await chooseImage()
  } catch (error) {
    if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
      uni.showToast({ title: '选图失败', icon: 'none' })
    }
  }
}

function removeCover() {
  form.value.coverImage = ''
}

async function chooseCoverForCard() {
  if (!cardEvent.value) return
  try {
    cardCoverImage.value = await chooseImage()
    patchSelectedCardEvent()
    void renderPreviewCard()
    await saveCardPreference(false)
  } catch (error) {
    if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) {
      uni.showToast({ title: '选图失败', icon: 'none' })
    }
  }
}

async function saveForm() {
  if (saving.value) return
  if (!form.value.title.trim()) {
    uni.showToast({ title: '先写一个名称', icon: 'none' })
    return
  }
  saving.value = true
  try {
    if (form.value.calendarType === 'lunar') applyLunarToSolar()
    const event = await saveAnniversary(form.value)
    upsertEvent(event)
    openCard(event)
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function openCard(event: AnniversaryEvent) {
  selectedId.value = event.id
  cardTemplate.value = event.cardTemplate || recommendedTemplateForScene(event.sceneType)
  cardTone.value = event.cardTone || 'warm'
  cardCoverImage.value = event.coverImage || ''
  panel.value = 'card'
  moreSheetOpen.value = false
  inviteSheetOpen.value = false
  membersPanelOpen.value = false
  activeInvite.value = null
  previewImage.value = ''
  void renderPreviewCard()
}

function selectCardTemplate(template: AnniversaryCardTemplate) {
  cardTemplate.value = template
  patchSelectedCardEvent()
  previewImage.value = ''
  void renderPreviewCard()
  void saveCardPreference(false)
}

function selectCardTone(tone: AnniversaryCardTone) {
  cardTone.value = tone
  patchSelectedCardEvent()
  previewImage.value = ''
  void renderPreviewCard()
  void saveCardPreference(false)
}

async function saveCardPreference(showToast = true) {
  if (!selectedEvent.value) return
  const base = selectedEvent.value
  // 偏好是每人一份：viewer 只发 myPrefs（走新后端的偏好分支）；
  // 非 viewer 发全量 draft——旧后端（未部署新版时）也能正常保存，避免 422
  const event = base.role === 'viewer'
    ? await saveAnniversaryMyPrefs(base.id, {
        cardTemplate: cardTemplate.value,
        cardTone: cardTone.value,
        coverImage: cardCoverImage.value,
      })
    : await saveAnniversary({
        ...draftFromEvent(base),
        cardTemplate: cardTemplate.value,
        cardTone: cardTone.value,
        coverImage: cardCoverImage.value,
      })
  upsertEvent(event)
  selectedId.value = event.id
  if (showToast) uni.showToast({ title: '卡片偏好已保存', icon: 'success' })
}

function patchSelectedCardEvent() {
  if (!selectedEvent.value) return
  upsertEvent({
    ...selectedEvent.value,
    cardTemplate: cardTemplate.value,
    cardTone: cardTone.value,
    coverImage: cardCoverImage.value,
  })
}

async function renderPreviewCard() {
  const event = cardEvent.value
  if (!event) return
  const seq = ++previewRenderSeq
  previewRendering.value = true
  try {
    await nextTick()
    const { canvas, ctx } = await getCanvasNode('#anniversary-export-canvas', instance)
    canvas.width = 1080
    canvas.height = 1440
    await renderAnniversaryCard(canvas, ctx, event, 1080, 1440)
    const filePath = await canvasToFile(canvas, 1080, 1440)
    canvas.width = 1
    canvas.height = 1
    if (seq === previewRenderSeq) {
      previewImage.value = filePath
    }
  } catch (error) {
    console.warn('[anniversary] render preview failed:', error)
  } finally {
    if (seq === previewRenderSeq) {
      previewRendering.value = false
    }
  }
}

const SUBSCRIBE_TMPL_ID = 'Jy26nV_9a4EbDPNzccPmnZ_ojRZ4EYSu5rjzmD1CYfc'

interface SubscribeReminderResult {
  accepted: boolean
  saved: boolean
  message: string
}

function resolveTarget(event: AnniversaryEvent): AnniversaryEvent {
  return event.id === selectedEvent.value?.id && cardEvent.value ? cardEvent.value : event
}

// 写入手机系统日历（addPhoneCalendar 要求在用户 TAP 手势的同步链里发起，
// 因此本函数入口直接绑 @tap，函数体在第一个 await 之前不能夹其它 await）。
async function addToCalendar(event: AnniversaryEvent) {
  const target = resolveTarget(event)
  try {
    await writePhoneCalendar(target)
    const updated = await markAnniversaryCalendarAdded(target.id, target.repeatType)
    upsertEvent(updated)
    uni.showToast({ title: '已写入手机日历', icon: 'success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '写入日历失败'
    if (!/cancel/i.test(message)) uni.showToast({ title: message, icon: 'none' })
  }
}

// 开启微信服务通知订阅（requestSubscribeMessage 同样要求 TAP 手势同步链，独立按钮直接绑 @tap）。
async function enableWechatReminder(event: AnniversaryEvent) {
  const target = resolveTarget(event)
  try {
    const result = await requestSubscribeReminder(target)
    if (result.accepted && result.saved) {
      uni.showToast({ title: '提醒已开启', icon: 'success' })
    } else if (result.accepted && !result.saved) {
      uni.showModal({
        title: '微信订阅未保存',
        content: `订阅授权成功，但保存失败：${result.message || '请稍后重试'}`,
        showCancel: false,
        confirmText: '知道了',
      })
    } else {
      uni.showToast({ title: '未开启微信提醒', icon: 'none' })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '开启提醒失败'
    if (!/cancel/i.test(message)) uni.showToast({ title: message, icon: 'none' })
  }
}

async function requestSubscribeReminder(event: AnniversaryEvent): Promise<SubscribeReminderResult> {
  const api = typeof wx !== 'undefined' ? wx : null
  const fallback = { accepted: false, saved: false, message: '' }
  if (!api || typeof api.requestSubscribeMessage !== 'function') return fallback

  try {
    const result = await new Promise<{ errMsg: string; [tmplId: string]: string }>((resolve, reject) => {
      api.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TMPL_ID],
        success: resolve,
        fail: reject,
      })
    })

    if (result[SUBSCRIBE_TMPL_ID] === 'accept') {
      const nextDate = computeOccurrence(event).date
      try {
        await subscribeAnniversaryReminder(event.id, SUBSCRIBE_TMPL_ID, nextDate)
        return { accepted: true, saved: true, message: '' }
      } catch (error) {
        const message = error instanceof Error ? error.message : '服务内部错误，请稍后重试'
        console.warn('[anniversary] save subscribe reminder failed:', error)
        return { accepted: true, saved: false, message }
      }
    }
  } catch (error) {
    console.warn('[anniversary] request subscribe reminder failed:', error)
  }
  return fallback
}

function writePhoneCalendar(event: AnniversaryEvent): Promise<void> {
  const occurrence = computeOccurrence(event)
  // 非全天日程 + 明确时刻：消除系统对全天事件默认 9:00 的提醒时间
  const times = buildCalendarEventTimes(event.remindDaysBefore, event.remindTime || '09:00', occurrence.date)
  const payload = {
    title: event.title,
    startTime: times.startTime,
    endTime: times.endTime,
    allDay: false,
    alarm: true,
    alarmOffset: times.alarmOffset,
    description: `来自枫叶小屋 · 时光纪念卡\n${defaultCopyForEvent(event, occurrence)}`,
  }
  return new Promise((resolve, reject) => {
    const api = typeof wx !== 'undefined' ? wx : null
    if (!api) {
      reject(new Error('当前平台暂不支持写入手机日历'))
      return
    }
    const success = () => resolve()
    const fail = (err: { errMsg?: string }) => reject(new Error(err.errMsg || '写入日历失败'))
    if (event.repeatType === 'yearly' && typeof api.addPhoneRepeatCalendar === 'function') {
      api.addPhoneRepeatCalendar({ ...payload, repeatInterval: 'year', success, fail })
      return
    }
    if (typeof api.addPhoneCalendar === 'function') {
      api.addPhoneCalendar({ ...payload, success, fail })
      return
    }
    reject(new Error('当前微信版本不支持写入手机日历'))
  })
}

async function exportCard() {
  if (!cardEvent.value || exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成卡片…', mask: true })
  try {
    await saveCardPreference(false)
    await nextTick()
    const { canvas, ctx } = await getCanvasNode('#anniversary-export-canvas', instance)
    canvas.width = 1080
    canvas.height = 1440
    await renderAnniversaryCard(canvas, ctx, cardEvent.value, 1080, 1440)
    const filePath = await canvasToFile(canvas, 1080, 1440)
    canvas.width = 1
    canvas.height = 1
    await saveImageToAlbum(filePath)
    uni.hideLoading()
    uni.showToast({ title: '已保存到相册', icon: 'success' })
  } catch (error) {
    uni.hideLoading()
    const message = error instanceof Error ? error.message : '保存失败'
    if (/auth|deny|denied/i.test(message)) {
      openAuthSetting()
    } else if (!/cancel/i.test(message)) {
      uni.showToast({ title: message, icon: 'none' })
    }
  } finally {
    exporting.value = false
  }
}

async function shareCard() {
  if (!cardEvent.value || exporting.value) return
  exporting.value = true
  uni.showLoading({ title: '正在生成卡片…', mask: true })
  try {
    await saveCardPreference(false)
    await nextTick()
    const { canvas, ctx } = await getCanvasNode('#anniversary-export-canvas', instance)
    canvas.width = 1080
    canvas.height = 1440
    await renderAnniversaryCard(canvas, ctx, cardEvent.value, 1080, 1440)
    const filePath = await canvasToFile(canvas, 1080, 1440)
    canvas.width = 1
    canvas.height = 1
    uni.hideLoading()

    // 微信原生图片分享（需要基础库 ≥ 2.14.1）
    const api = typeof wx !== 'undefined' ? wx as Record<string, any> : null
    const sdkSupported = api && typeof api.showShareImageMenu === 'function'

    if (sdkSupported) {
      api.showShareImageMenu({
        path: filePath,
        fail: (err: { errMsg?: string }) => {
          if (!/cancel/i.test(err.errMsg || '')) {
            uni.showToast({ title: '分享失败', icon: 'none' })
          }
        },
      })
    } else {
      // 降级：先存到相册，提示用户手动分享
      await saveImageToAlbum(filePath)
      uni.showToast({ title: '已存相册，可从相册分享', icon: 'none' })
    }
  } catch (error) {
    uni.hideLoading()
    const message = error instanceof Error ? error.message : '分享失败'
    if (!/cancel/i.test(message)) {
      uni.showToast({ title: message, icon: 'none' })
    }
  } finally {
    exporting.value = false
  }
}

function removeCurrent() {
  if (!selectedEvent.value) return
  uni.showModal({
    title: '删除纪念日',
    content: `确定删除「${selectedEvent.value.title}」吗？共享成员将不再看到这个日子。`,
    confirmText: '删除',
    confirmColor: '#e06a5a',
    success: (result) => {
      if (!result.confirm || !selectedEvent.value) return
      void deleteAnniversary(selectedEvent.value.id).then(() => {
        events.value = events.value.filter((event) => event.id !== selectedEvent.value?.id)
        selectedId.value = null
        panel.value = 'home'
        uni.showToast({ title: '已删除', icon: 'success' })
      })
    },
  })
}

function handleMoreAction(key: MoreAction['key']) {
  const event = selectedEvent.value
  if (!event) return
  switch (key) {
    case 'edit':
      moreSheetOpen.value = false
      openEdit(event)
      break
    case 'cover':
      moreSheetOpen.value = false
      void chooseCoverForCard()
      break
    case 'calendar':
      moreSheetOpen.value = false
      void addToCalendar(event)
      break
    case 'wechat':
      moreSheetOpen.value = false
      void enableWechatReminder(event)
      break
    case 'invite':
      moreSheetOpen.value = false
      inviteSheetOpen.value = true
      break
    case 'members':
      moreSheetOpen.value = false
      membersPanelOpen.value = true
      break
    case 'delete':
      moreSheetOpen.value = false
      removeCurrent()
      break
  }
}

function onInviteCreated(invite: { code: string, role: 'editor' | 'viewer' }) {
  activeInvite.value = invite
}

function onLeftSharedEvent() {
  const event = selectedEvent.value
  if (!event) return
  events.value = events.value.filter((item) => item.id !== event.id)
  selectedId.value = null
  panel.value = 'home'
  uni.showToast({ title: '已退出共享', icon: 'success' })
}

function upsertEvent(event: AnniversaryEvent) {
  const index = events.value.findIndex((item) => item.id === event.id)
  if (index >= 0) {
    events.value.splice(index, 1, event)
  } else {
    events.value.push(event)
  }
}

function badgeMonth(event: AnniversaryEvent): string {
  return `${Number(computeOccurrence(event).date.slice(5, 7))}月`
}

function badgeDay(event: AnniversaryEvent): string {
  return String(Number(computeOccurrence(event).date.slice(-2)))
}

function templateName(template: AnniversaryCardTemplate): string {
  return TEMPLATE_OPTIONS.find((item) => item.key === template)?.name ?? '极简'
}

function toneName(tone: AnniversaryCardTone): string {
  return TONE_OPTIONS.find((item) => item.key === tone)?.name ?? '温柔'
}

function toneHint(tone: AnniversaryCardTone): string {
  return TONE_OPTIONS.find((item) => item.key === tone)?.hint ?? '暖棕调'
}
</script>

<style lang="scss" scoped>
@import '@/styles/anniversary-scene.scss';

.anniversary {
  min-height: 100vh;
  padding: 0 32rpx 180rpx;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20rpx;
    padding: 40rpx 0 36rpx;
  }

  &__header-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__eyebrow {
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__title {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  &__header-action {
    min-width: 104rpx;
    padding: 14rpx 20rpx;
    border-radius: $radius-md;
    background: $color-primary;
    color: #fff;
    font-size: 26rpx;
    font-weight: 600;
    text-align: center;
  }

  &__loading {
    min-height: 360rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18rpx;
    color: $color-text-secondary;
    text-align: center;
  }

  &__empty-action {
    width: 320rpx;
    margin-top: 18rpx;
  }

  /* ---- hero：满幅场景渐变 ---- */

  &__hero {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14rpx;
    margin: 0 -32rpx 28rpx;
    padding: 36rpx 36rpx 30rpx;
    overflow: hidden;
    color: #ffffff;
    box-shadow: 0 16rpx 40rpx rgba(74, 63, 53, 0.18);

    &::after {
      content: '';
      position: absolute;
      top: -120rpx;
      right: -80rpx;
      width: 340rpx;
      height: 340rpx;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      pointer-events: none;
    }
  }

  &__hero-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20rpx;
  }

  &__hero-scene {
    padding: 8rpx 20rpx;
    border-radius: 999rpx;
    background: rgba(0, 0, 0, 0.16);
    border: 2rpx solid rgba(255, 255, 255, 0.24);
    color: #ffffff;
    font-size: 22rpx;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__hero-kicker {
    color: rgba(255, 255, 255, 0.92);
    font-size: 22rpx;
    font-weight: 500;
    letter-spacing: 4rpx;
  }

  &__hero-title {
    font-size: 38rpx;
    font-weight: 700;
    color: #ffffff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__hero-number {
    display: flex;
    align-items: baseline;
    gap: 10rpx;
  }

  &__hero-days {
    font-size: 140rpx;
    font-weight: 700;
    line-height: 0.95;
    color: #ffffff;
  }

  &__hero-unit {
    font-size: 36rpx;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  &__hero-detail {
    color: rgba(255, 255, 255, 0.88);
    font-size: 26rpx;
  }

  &__hero-milestone {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    margin-top: 6rpx;
  }

  &__hero-milestone-head {
    display: flex;
    justify-content: space-between;
    color: rgba(255, 255, 255, 0.92);
    font-size: 22rpx;
  }

  &__hero-milestone-pct {
    font-weight: 700;
    color: #ffffff;
  }

  &__hero-milestone-track {
    height: 8rpx;
    border-radius: 999rpx;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
  }

  &__hero-milestone-bar {
    height: 8rpx;
    border-radius: 999rpx;
    background: #ffffff;
  }

  &__hero-actions {
    display: flex;
    gap: 16rpx;
    margin-top: 10rpx;
  }

  &__hero-btn {
    flex: 1;
    height: 72rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999rpx;
    background: rgba(255, 255, 255, 0.18);
    border: 2rpx solid rgba(255, 255, 255, 0.32);
    color: #ffffff;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16rpx;
    margin-bottom: 32rpx;
  }

  &__stat {
    padding: 24rpx 16rpx;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__stat-value {
    color: $color-text;
    font-size: 44rpx;
    font-weight: 700;
  }

  /* ---- filter & search ---- */

  &__search {
    flex: 1;
    min-width: 0;
    height: 76rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    padding: 0 22rpx;
    background: #fffdfb;
    color: $color-text;
    font-size: 26rpx;
  }

  &__search-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  &__search-row--active &__search {
    border-color: $color-primary;
  }

  &__search-clear {
    flex-shrink: 0;
    width: 56rpx;
    height: 56rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 28rpx;
    line-height: 1;
  }

  &__scene-filter {
    white-space: nowrap;
    margin-bottom: 20rpx;
  }

  &__scene-chip {
    display: inline-flex;
    align-items: center;
    gap: 10rpx;
    padding: 12rpx 24rpx;
    margin-right: 12rpx;
    border: 2rpx solid $color-border;
    border-radius: 999rpx;
    background: $color-card;
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  &__chip-dot {
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ---- 时间状态 tab + 搜索结果 ---- */

  &__sticky {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-bottom: 20rpx;
    padding: 16rpx 0 12rpx;
    background: $color-card;
    box-shadow: 0 6rpx 16rpx rgba(74, 63, 53, 0.06);
  }

  &__tabs {
    display: flex;
    gap: 12rpx;
  }

  &__tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    height: 68rpx;
    border-radius: $radius-md;
    background: $color-card;
    border: 2rpx solid $color-border;
  }

  &__tab--active {
    background: $color-primary;
    border-color: $color-primary;
  }

  &__tab-label {
    color: $color-text-secondary;
    font-size: 26rpx;
    font-weight: 500;
  }

  &__tab--active &__tab-label {
    color: #fff;
    font-weight: 600;
  }

  &__tab-count {
    color: $color-text-secondary;
    font-size: 20rpx;
  }

  &__tab--active &__tab-count {
    color: rgba(255, 255, 255, 0.8);
  }

  &__resultbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    height: 64rpx;
    margin-bottom: 24rpx;
    border-radius: $radius-md;
    background: $color-primary-light;
  }

  &__resultbar-text {
    color: $color-primary-dark;
    font-size: 24rpx;
    font-weight: 600;
  }

  &__src-pill {
    padding: 4rpx 16rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 22rpx;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__loadmore {
    padding: 8rpx 0 4rpx;
    text-align: center;
    color: $color-text-secondary;
    font-size: 22rpx;
  }

  &__event--done {
    opacity: 0.55;
  }

  &__event-count--muted {
    color: $color-text-secondary;
  }

  /* ---- event rows ---- */

  &__event {
    position: relative;
    display: grid;
    grid-template-columns: 8rpx 76rpx 1fr auto;
    align-items: center;
    gap: 18rpx;
    padding: 20rpx 24rpx 20rpx 20rpx;
    overflow: hidden;
  }

  &__event-bar {
    width: 8rpx;
    height: 72rpx;
    border-radius: 999rpx;
  }

  &__date-badge {
    width: 76rpx;
    height: 76rpx;
    border-radius: $radius-md;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  &__date-badge-month {
    font-size: 18rpx;
    line-height: 1.1;
    opacity: 0.75;
  }

  &__date-badge-day {
    margin-top: 4rpx;
    font-size: 30rpx;
    line-height: 1;
  }

  &__event-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__event-title-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
    min-width: 0;
  }

  &__event-title {
    color: $color-text;
    font-size: 30rpx;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__event-reminder-badge {
    padding: 2rpx 10rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 20rpx;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__event-shared-badge {
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
    background: #eef1f7;
    color: #5e6f9a;
    font-size: 20rpx;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__event-count {
    font-size: 26rpx;
    font-weight: 700;
    white-space: nowrap;
  }

  /* ---- 邀请接受面板 ---- */

  &__invite {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    padding: 56rpx 40rpx;
    text-align: center;
  }

  &__invite-eyebrow {
    color: $color-primary-dark;
    font-size: 24rpx;
    letter-spacing: 6rpx;
  }

  &__invite-avatar {
    width: 108rpx;
    height: 108rpx;
    border-radius: 50%;
    background: $color-primary-light;
  }

  &__invite-avatar--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
  }

  &__invite-title {
    color: $color-text;
    font-size: 40rpx;
    font-weight: 700;
  }

  &__invite-role {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    width: 100%;
    padding: 20rpx 24rpx;
    border-radius: $radius-md;
    background: #f6efe7;
  }

  &__invite-role-title {
    font-size: 28rpx;
    font-weight: 700;
    color: $color-text;
  }

  &__invite-actions {
    display: flex;
    gap: 18rpx;
    width: 100%;
    margin-top: 12rpx;
  }

  &__invite-btn {
    flex: 1;
  }

  &__invite-expire {
    margin-top: 4rpx;
  }

  /* ---- 编辑页：场景格子 ---- */

  &__scene-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14rpx;
    margin-bottom: 24rpx;
  }

  &__scene-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    padding: 20rpx 0 16rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    background: $color-card;
  }

  &__scene-cell-icon {
    font-size: 40rpx;
    line-height: 1;
  }

  &__scene-cell-name {
    color: $color-text;
    font-size: 22rpx;
    font-weight: 500;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 22rpx;
    margin-bottom: 24rpx;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }

  &__input,
  &__picker {
    min-height: 84rpx;
    border: 2rpx solid $color-border;
    border-radius: $radius-md;
    padding: 0 22rpx;
    background: #fffdfb;
    color: $color-text;
    font-size: 28rpx;
    display: flex;
    align-items: center;
  }

  &__segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8rpx;
    padding: 8rpx;
    border-radius: $radius-md;
    background: #f9eee3;
  }

  &__segmented view {
    padding: 16rpx 10rpx;
    border-radius: $radius-sm;
    text-align: center;
    color: $color-text-secondary;
    font-size: 26rpx;
  }

  &__segmented .active {
    background: #fff;
    color: $color-primary-dark;
    font-weight: 700;
    box-shadow: 0 4rpx 12rpx rgba($color-primary, 0.12);
  }

  &__lunar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18rpx;
  }

  &__lunar-hint {
    grid-column: 1 / -1;
  }

  /* ---- 提醒时刻 ---- */

  &__time-row {
    display: flex;
    gap: 12rpx;
    flex-wrap: wrap;
  }

  &__time-chip {
    min-width: 128rpx;
    height: 68rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background: #f6efe7;
    color: $color-text-secondary;
    font-size: 26rpx;
    font-weight: 500;
  }

  &__time-chip--active {
    background: #fbeae5;
    border: 2rpx solid #e06a5a;
    color: #b8402e;
    font-weight: 700;
  }

  &__time-chip--custom {
    border: 2rpx dashed $color-border;
  }

  &__cover {
    min-height: 220rpx;
    border: 2rpx dashed $color-border;
    border-radius: $radius-md;
    overflow: hidden;
    background: #fffdfb;
  }

  &__cover-image-wrap {
    position: relative;
    width: 100%;
    height: 280rpx;
  }

  &__cover-image {
    width: 100%;
    height: 100%;
    display: block;
  }

  &__cover-remove {
    position: absolute;
    top: 12rpx;
    right: 12rpx;
    width: 48rpx;
    height: 48rpx;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 26rpx;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__cover-empty {
    min-height: 220rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10rpx;
    color: $color-primary-dark;
  }

  &__actions {
    display: flex;
    gap: 18rpx;
    margin-top: 8rpx;
  }

  &__action {
    flex: 1;
    font-size: 26rpx;
    padding: 18rpx 0;
  }

  /* ---- 卡片页 ---- */

  &__card-preview {
    min-height: 760rpx;
    margin-bottom: 28rpx;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    background: linear-gradient(150deg, #fff8f0, #fef5ea);
    border: 2rpx solid $color-border;
  }

  &__canvas-preview {
    margin-bottom: 28rpx;
    padding: 0;
    overflow: hidden;
    border: 2rpx solid $color-border;
  }

  &__canvas-preview-image {
    width: 100%;
    display: block;
  }

  &__canvas-preview-state {
    display: block;
    padding: 0 24rpx 24rpx;
  }

  &__card-preview--warm {
    background: linear-gradient(150deg, #fff8f0, #fef5ea);
  }

  &__card-preview--fresh {
    background: linear-gradient(150deg, #eef8f5, #edfaf5);
  }

  &__card-preview--classic {
    background: linear-gradient(150deg, #f6f3ee, #f5f1ea);
  }

  &__card-preview--rose {
    background: linear-gradient(150deg, #fff3f4, #fef0f1);
  }

  &__card-preview--ink {
    background: linear-gradient(150deg, #f7f7f4, #f4f6f2);
  }

  &__card-preview--certificate {
    border: 6rpx double $color-primary;
  }

  &__card-preview--boarding {
    border-radius: 24rpx;
  }

  &__preview-media {
    height: 280rpx;
    border-radius: $radius-md;
    margin-bottom: 24rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  &__preview-media image {
    width: 100%;
    height: 100%;
  }

  &__preview-bg-wrap {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  &__preview-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    opacity: 0.88;
  }

  &__preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(150deg, rgba(255, 248, 240, 0.34), rgba(255, 255, 255, 0.24));
  }

  &__card-preview--fresh &__preview-overlay {
    background: linear-gradient(150deg, rgba(238, 248, 245, 0.34), rgba(255, 255, 255, 0.24));
  }

  &__card-preview--classic &__preview-overlay {
    background: linear-gradient(150deg, rgba(246, 243, 238, 0.36), rgba(255, 255, 255, 0.26));
  }

  &__card-preview--rose &__preview-overlay {
    background: linear-gradient(150deg, rgba(255, 243, 244, 0.34), rgba(255, 255, 255, 0.24));
  }

  &__card-preview--ink &__preview-overlay {
    background: linear-gradient(150deg, rgba(247, 247, 244, 0.34), rgba(255, 255, 255, 0.24));
  }

  &__card-preview--has-cover {
    position: relative;
  }

  &__card-preview--has-cover &__preview-labels,
  &__card-preview--has-cover &__preview-number,
  &__card-preview--has-cover &__preview-title,
  &__card-preview--has-cover &__preview-copy,
  &__card-preview--has-cover &__preview-date {
    position: relative;
    z-index: 2;
  }

  &__card-preview--has-cover:not(.anniversary__card-preview--photo-bg) &__preview-number,
  &__card-preview--has-cover:not(.anniversary__card-preview--photo-bg) &__preview-title,
  &__card-preview--has-cover:not(.anniversary__card-preview--photo-bg) &__preview-copy,
  &__card-preview--has-cover:not(.anniversary__card-preview--photo-bg) &__preview-date {
    text-shadow: 0 2rpx 8rpx rgba(255, 255, 255, 0.6);
  }

  &__card-preview--photo-bg &__preview-bg {
    opacity: 1;
  }

  &__card-preview--photo-bg &__preview-overlay {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.08) 12%, rgba(0, 0, 0, 0.22) 55%, rgba(0, 0, 0, 0.42) 100%);
  }

  &__card-preview--photo-bg &__preview-label,
  &__card-preview--photo-bg &__preview-number,
  &__card-preview--photo-bg &__preview-title,
  &__card-preview--photo-bg &__preview-copy,
  &__card-preview--photo-bg &__preview-date,
  &__card-preview--photo-bg &__preview-unit {
    position: relative;
    z-index: 2;
    color: #ffffff;
    text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.28);
  }

  &__card-preview--photo-bg &__preview-label {
    background: rgba(255, 255, 255, 0.28);
    color: #ffffff;
  }

  &__preview-labels {
    display: flex;
    gap: 12rpx;
    align-self: flex-start;
    position: relative;
    z-index: 2;
  }

  &__preview-label {
    align-self: flex-start;
    padding: 8rpx 16rpx;
    border-radius: 999rpx;
    background: $color-primary-light;
    color: $color-primary-dark;
    font-size: 22rpx;
  }

  &__preview-label--tone {
    background: rgba($color-primary, 0.1);
    color: $color-text-secondary;
  }

  &__preview-number {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8rpx;
    margin-top: 56rpx;
    color: $color-text;
  }

  &__preview-number > text:first-child {
    font-size: 112rpx;
    font-weight: 700;
    line-height: 0.92;
  }

  &__preview-unit {
    font-size: 32rpx;
    font-weight: 600;
    color: $color-text-secondary;
  }

  &__preview-title {
    margin-top: 24rpx;
    color: $color-text;
    font-size: 42rpx;
    font-weight: 700;
  }

  &__preview-copy {
    margin-top: 20rpx;
    color: $color-text-secondary;
    font-size: 26rpx;
    line-height: 1.6;
  }

  &__preview-date {
    margin-top: 56rpx;
    color: $color-text-secondary;
    font-size: 24rpx;
  }

  /* ---- preview decorations matching exported card ---- */

  &__preview-stamp {
    position: absolute;
    bottom: 280rpx;
    right: 70rpx;
    width: 108rpx;
    height: 108rpx;
    border: 5rpx solid #c0392b;
    border-radius: 50%;
    color: #c0392b;
    font-size: 44rpx;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(-16deg);
    box-shadow: inset 0 0 0 12rpx #fff, inset 0 0 0 16rpx #c0392b;
    z-index: 2;
  }

  &__preview-ring-wrap {
    position: absolute;
    bottom: 340rpx;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  &__preview-ring {
    width: 140rpx;
    height: 140rpx;
    border-radius: 50%;
    border: 14rpx solid $color-border;
    border-top-color: $color-primary;
    transform: rotate(45deg);
  }

  &__preview-ring-text {
    position: absolute;
    color: $color-primary;
    font-size: 26rpx;
    font-weight: 600;
  }

  &__preview-ribbon {
    position: absolute;
    top: 96rpx;
    left: 44rpx;
    z-index: 2;
    padding: 14rpx 28rpx;
    border-radius: 0 999rpx 999rpx 0;
    background: $color-primary;
    color: #ffffff;
    font-size: 24rpx;
    font-weight: 600;
  }

  &__preview-spark {
    position: absolute;
    z-index: 2;
    width: 30rpx;
    height: 30rpx;
    background: $color-primary;
    clip-path: polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%);
    opacity: 0.46;
  }

  &__preview-dot {
    position: absolute;
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: $color-primary;
    opacity: 0.45;
    z-index: 2;
  }

  &__reminder-status {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-bottom: 8rpx;
    padding: 18rpx 24rpx;
    color: $color-text;
    font-size: 26rpx;
    background: #f0f7f0;
    border-color: #c8dcc8;
  }

  &__shared-bar {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-bottom: 8rpx;
    padding: 18rpx 24rpx;
    background: #eef1f7;
    border-color: #d5dcea;
  }

  &__shared-bar-main {
    color: #4a5878;
    font-size: 26rpx;
    font-weight: 600;
  }

  /* ---- 模板缩略图 / 风格色卡 ---- */

  &__tpl-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14rpx;
  }

  &__tpl {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  &__tpl-thumb {
    height: 104rpx;
    border-radius: $radius-md;
    border: 2rpx solid $color-border;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4rpx;
    overflow: hidden;
  }

  &__tpl-thumb-num {
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1;
    color: $color-text;
  }

  &__tpl-thumb-name {
    font-size: 20rpx;
    color: $color-text-secondary;
  }

  &__tpl--active &__tpl-thumb {
    border: 3rpx solid $color-primary-dark;
    background: $color-primary-light;
  }

  &__tpl-thumb--certificate &__tpl-thumb {
    border: 4rpx double #b8925e;
  }

  &__tpl-thumb--progress &__tpl-thumb-num {
    color: $color-primary;
  }

  &__tpl-thumb--calendar &__tpl-thumb-num {
    color: #8a6fa8;
  }

  &__tpl-thumb--photo &__tpl-thumb {
    background: repeating-linear-gradient(45deg, #f3ece2, #f3ece2 12rpx, #efe6d8 12rpx, #efe6d8 24rpx);
  }

  &__tpl-thumb--boarding &__tpl-thumb {
    border-radius: 20rpx 20rpx 8rpx 8rpx;
    background: #e8f0f7;
  }

  &__tpl-thumb--festival &__tpl-thumb {
    background: #fdf0f2;
  }

  &__tone-row {
    display: flex;
    gap: 14rpx;
    flex-wrap: wrap;
  }

  &__tone {
    min-width: 104rpx;
    padding: 12rpx 22rpx;
    border: 2rpx solid $color-border;
    border-radius: 999rpx;
    background: $color-card;
    text-align: center;
    color: $color-text-secondary;
    font-size: 24rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }

  &__tone-swatch {
    width: 44rpx;
    height: 20rpx;
    border-radius: 999rpx;
  }

  &__tone-swatch--warm {
    background: linear-gradient(90deg, #fff8f0, #f0dcc0);
  }

  &__tone-swatch--fresh {
    background: linear-gradient(90deg, #eef8f5, #cfe8de);
  }

  &__tone-swatch--classic {
    background: linear-gradient(90deg, #f6f3ee, #ddd6ca);
  }

  &__tone-swatch--rose {
    background: linear-gradient(90deg, #fff3f4, #f2d2d5);
  }

  &__tone-swatch--ink {
    background: linear-gradient(90deg, #f7f7f4, #d9ded4);
  }

  &__tone--active {
    border-color: $color-primary;
    color: $color-primary-dark;
    font-weight: 600;
  }

  /* ---- 底部固定条 + 更多面板 ---- */

  &__bottom-space {
    height: 140rpx;
  }

  &__bottom-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 80;
    display: flex;
    gap: 16rpx;
    align-items: center;
    padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
    background: #fffdf9;
    border-top: 2rpx solid $color-border;
  }

  &__bottom-btn {
    width: 92rpx;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background: #f0e7da;
    color: $color-text-secondary;
    font-size: 32rpx;
    font-weight: 700;
  }

  &__bottom-cta {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-md;
    background: linear-gradient(180deg, #d95440, #b8402e);
    color: #ffffff;
    font-size: 30rpx;
    font-weight: 700;
    box-shadow: 0 8rpx 24rpx rgba(184, 64, 46, 0.3);

    &.disabled {
      opacity: 0.6;
    }
  }

  &__sheet-mask {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(74, 63, 53, 0.55);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  &__sheet {
    background: $color-card;
    border-radius: 32rpx 32rpx 0 0;
    padding: 16rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  &__sheet-grabber {
    width: 72rpx;
    height: 8rpx;
    border-radius: 999rpx;
    background: #e0d5c5;
    margin: 0 auto 12rpx;
  }

  &__sheet-title {
    color: $color-text;
    font-size: 30rpx;
    font-weight: 700;
    padding: 8rpx 4rpx 14rpx;
  }

  &__sheet-item {
    display: flex;
    align-items: center;
    gap: 20rpx;
    padding: 20rpx 8rpx;
    border-top: 2rpx solid rgba(240, 228, 215, 0.6);
  }

  &__sheet-item--danger &__sheet-item-title {
    color: $color-danger;
  }

  &__sheet-icon {
    width: 72rpx;
    height: 72rpx;
    border-radius: $radius-md;
    background: #f6efe7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30rpx;
    flex-shrink: 0;
  }

  &__sheet-item--danger &__sheet-icon {
    background: #fbeae5;
  }

  &__sheet-texts {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__sheet-item-title {
    color: $color-text;
    font-size: 28rpx;
    font-weight: 600;
  }

  &__sheet-chevron {
    color: $color-text-secondary;
    font-size: 28rpx;
  }

  &__delete {
    margin: 48rpx 0 36rpx;
    padding: 24rpx 0;
    border: 2rpx solid $color-danger;
    border-radius: $radius-md;
    color: $color-danger;
    font-size: 28rpx;
    font-weight: 600;
    text-align: center;
  }

  &__export-canvas {
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 1px;
    height: 1px;
  }
}
</style>
