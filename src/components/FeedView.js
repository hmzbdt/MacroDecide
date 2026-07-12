import React from 'react';
import {
  Text, View, TextInput, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { calculateMatchPercentage } from '../utils/macroMath';
import { RESTAURANT_DB } from '../data/restaurantDB';
import { VERIFIED_MENUS } from '../data/verifiedMenus';
import { s, C } from '../styles/appStyles';

// Merged lookup for feed bestPct (VERIFIED_MENUS takes precedence over RESTAURANT_DB)
const COMBINED_MENUS = { ...RESTAURANT_DB, ...VERIFIED_MENUS };

export default function FeedView({
  goHome, openDetail,
  targetP, targetC, targetF,
  restaurants, feedLoading, setRestaurants,
  feedMode, setFeedMode, feedQuery, setFeedQuery,
  searchRadius, setSearchRadius, searchRadiusRef, loadFeed,
}) {
  const targets = { protein: parseFloat(targetP)||0, carbs: parseFloat(targetC)||0, fat: parseFloat(targetF)||0 };
  const hasTargets = targets.protein > 0 || targets.carbs > 0 || targets.fat > 0;

  // ── Near Me cards ─────────────────────────────────────────────────────────
  const rawList = restaurants.length > 0 ? restaurants
    : (!feedLoading ? Object.keys(COMBINED_MENUS).map(name => ({ name, distance: null, address: null, latitude: null, longitude: null, placeId: null })) : []);

  const nearMeCards = rawList.map(r => {
    const key = Object.keys(COMBINED_MENUS).find(k =>
      k.toLowerCase() === r.name.toLowerCase() ||
      r.name.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(r.name.toLowerCase()));
    let bestPct = null, bestFit = null;
    if (key) {
      let best = 0;
      for (const item of COMBINED_MENUS[key]) {
        const pct = calculateMatchPercentage(targets, { protein: item.protein, carbs: item.carbs, fat: item.fat });
        if (pct > best) { best = pct; if (item.category === 'protein') bestFit = item.name; }
      }
      bestPct = Math.round(best);
    }
    return { ...r, bestPct, bestFit };
  }).sort((a, b) => {
    if (a.bestPct !== null && b.bestPct !== null) return b.bestPct - a.bestPct;
    if (a.bestPct !== null) return -1; if (b.bestPct !== null) return 1;
    return (a.distance ?? Infinity) - (b.distance ?? Infinity);
  });

  // ── Plan Ahead cards ──────────────────────────────────────────────────────
  const planAheadCards = Object.keys(COMBINED_MENUS)
    .filter(name => !feedQuery || name.toLowerCase().includes(feedQuery.toLowerCase()))
    .map(name => {
      let bestPct = 0, bestFit = null;
      for (const item of COMBINED_MENUS[name]) {
        const pct = calculateMatchPercentage(targets, { protein: item.protein, carbs: item.carbs, fat: item.fat });
        if (pct > bestPct) { bestPct = pct; if (item.category === 'protein') bestFit = item.name; }
      }
      return { name, bestPct: Math.round(bestPct), bestFit, distance: null, address: null, latitude: null, longitude: null, placeId: null };
    })
    .sort((a, b) => hasTargets
      ? (b.bestPct - a.bestPct) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name)
    );

  const renderFeedCard = (r, i) => {
    const bg = r.bestPct == null ? '#8E8E93' : r.bestPct >= 80 ? '#34C759' : r.bestPct >= 50 ? '#FF9500' : '#8E8E93';
    return (
      <TouchableOpacity key={`${r.name}-${i}`} style={s.feedCard} onPress={() => openDetail(r)} activeOpacity={0.78}>
        <View style={s.feedThumb}><Text style={s.feedInitials}>{r.name?.[0]?.toUpperCase() ?? '?'}</Text></View>
        <View style={{ flex: 1 }}>
          <View style={s.feedCardTop}>
            <Text style={s.feedName} numberOfLines={1}>{r.name}</Text>
            <View style={[s.badge, { backgroundColor: bg }]}>
              <Text style={s.badgeTxt}>{r.bestPct != null ? `${r.bestPct}% Match` : 'Tap to load'}</Text>
            </View>
          </View>
          {r.bestFit
            ? <Text style={s.feedSub} numberOfLines={1}>Best: {r.bestFit}</Text>
            : r.distance != null
              ? <Text style={s.feedSub}>{r.distance < 0.1 ? 'Nearby' : `${r.distance.toFixed(1)} mi`}</Text>
              : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={20} color={C.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{feedMode === 'plan_ahead' ? 'Search Popular Chains' : 'Nearby Restaurants'}</Text>
        <TouchableOpacity onPress={goHome} style={s.headerIcon} activeOpacity={0.7}>
          <Ionicons name="home-outline" size={20} color={C.gray} />
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={s.feedModeBar}>
        <TouchableOpacity
          style={[s.feedModeBtn, feedMode === 'near_me' && s.feedModeBtnActive]}
          onPress={() => setFeedMode('near_me')}
          activeOpacity={0.8}
        >
          <Ionicons name="location-outline" size={13} color={feedMode === 'near_me' ? C.gray : C.muted} style={{ marginRight: 5 }} />
          <Text style={[s.feedModeTxt, feedMode === 'near_me' && s.feedModeTxtActive]}>Near Me</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.feedModeBtn, feedMode === 'plan_ahead' && s.feedModeBtnActive]}
          onPress={() => { setFeedMode('plan_ahead'); setFeedQuery(''); }}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={13} color={feedMode === 'plan_ahead' ? C.gray : C.muted} style={{ marginRight: 5 }} />
          <Text style={[s.feedModeTxt, feedMode === 'plan_ahead' && s.feedModeTxtActive]}>Search Popular Chains</Text>
        </TouchableOpacity>
      </View>

      {/* Radius slider — Near Me only */}
      {feedMode === 'near_me' && (
        <View style={s.radiusRow}>
          <Text style={s.radiusLabel}>Radius</Text>
          <Slider
            style={s.radiusSlider}
            minimumValue={0}
            maximumValue={15}
            step={5}
            value={searchRadius}
            onSlidingComplete={(val) => {
              searchRadiusRef.current = val;
              setSearchRadius(val);
              setRestaurants([]);
              loadFeed(true);
            }}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor='#E5E5EA'
            thumbTintColor={C.accent}
          />
          <Text style={s.radiusValue}>{searchRadius} mi</Text>
        </View>
      )}

      {/* Search bar — Plan Ahead only */}
      {feedMode === 'plan_ahead' && (
        <View style={s.feedSearchRow}>
          <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={s.feedSearchInput}
            value={feedQuery}
            onChangeText={setFeedQuery}
            placeholder="Search all restaurants…"
            placeholderTextColor={C.muted}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {feedQuery.length > 0 && (
            <TouchableOpacity onPress={() => setFeedQuery('')} activeOpacity={0.7} style={{ marginLeft: 6 }}>
              <Ionicons name="close-circle" size={16} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Content */}
      {feedMode === 'near_me' ? (
        feedLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={C.accent} /><Text style={s.centerTxt}>Finding restaurants nearby…</Text></View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.feedList} showsVerticalScrollIndicator={false}>
            {nearMeCards.length === 0
              ? <View style={s.center}><Ionicons name="location-outline" size={48} color={C.muted} /><Text style={s.centerTxt}>No restaurants found.{'\n'}Check location permissions.</Text></View>
              : nearMeCards.map(renderFeedCard)
            }
            <View style={{ height: 40 }} />
          </ScrollView>
        )
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.feedList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {planAheadCards.length === 0
            ? <View style={s.center}><Ionicons name="search-outline" size={48} color={C.muted} /><Text style={s.centerTxt}>{`No results for "${feedQuery}"`}</Text></View>
            : planAheadCards.map(renderFeedCard)
          }
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
