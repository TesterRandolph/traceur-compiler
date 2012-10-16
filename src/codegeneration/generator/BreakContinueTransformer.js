// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import BreakState from 'BreakState.js';
import ContinueState from 'ContinueState.js';
import ParseTreeTransformer from '../ParseTreeTransformer.js';
import StateMachine from '../../syntax/trees/StateMachine.js';
import createObject from '../../util/util.js';
import trees from '../../syntax/trees/ParseTrees.js';

var BreakStatement = trees.BreakStatement;
var ContinueStatement = trees.ContinueStatement;
var DoWhileStatement = trees.DoWhileStatement;
var ForOfStatement = trees.ForOfStatement;
var ForStatement = trees.ForStatement;
var FunctionDeclaration = trees.FunctionDeclaration;
var SwitchStatement = trees.SwitchStatement;
var WhileStatement = trees.WhileStatement;

/**
 * Converts statements which do not contain a yield, to a state machine. Always called from a
 * context where the containing block contains a yield. Normally this just wraps the statement into
 * a single state StateMachine. However, if the statement contains a break or continue which
 * exits the statement, then the non-local break/continue must be converted into state machines.
 *
 * Note that parents of non-local break/continue statements are themselves translated into
 * state machines by the caller.
 *
 * @param {StateAllocator} stateAllocator
 * @extends {ParseTreeTransformer}
 * @constructor
 */
export function BreakContinueTransformer(stateAllocator) {
  ParseTreeTransformer.call(this);
  this.transformBreaks_ = true;
  this.stateAllocator_ = stateAllocator;
}

/**
 * @param {BreakStatement|ContinueStatement} tree
 * @return {string}
 */
function safeGetLabel(tree) {
  return tree.name ? tree.name.value : null;
}

var proto = ParseTreeTransformer.prototype;
BreakContinueTransformer.prototype = createObject(proto, {

  /** @return {number} */
  allocateState_: function() {
    return this.stateAllocator_.allocateState();
  },

  /**
   * @param {State} newState
   * @return {StateMachibneTree}
   */
  stateToStateMachine_: function(newState) {
    // TODO: this shouldn't be required, but removing it requires making consumers resilient
    // TODO: to a machine with INVALID fallThroughState
    var fallThroughState = this.allocateState_();
    return new StateMachine(newState.id, fallThroughState, [newState], []);
  },

  /**
   * @param {BreakStatement} tree
   * @return {ParseTree}
   */
  transformBreakStatement: function(tree) {
    return this.transformBreaks_ ?
        this.stateToStateMachine_(new BreakState(this.allocateState_(), safeGetLabel(tree))) :
        tree;
  },

  /**
   * @param {ContinueStatement} tree
   * @return {ParseTree}
   */
  transformContinueStatement: function(tree) {
    return this.stateToStateMachine_(new ContinueState(this.allocateState_(), safeGetLabel(tree)));
  },

  /**
   * @param {DoWhileStatement} tree
   * @return {ParseTree}
   */
  transformDoWhileStatement: function(tree) {
    return tree;
  },

  /**
   * @param {ForOfStatement} tree
   * @return {ParseTree}
   */
  transformForOfStatement: function(tree) {
    return tree;
  },

  /**
   * @param {ForStatement} tree
   * @return {ParseTree}
   */
  transformForStatement: function(tree) {
    return tree;
  },

  /**
   * @param {FunctionDeclaration} tree
   * @return {ParseTree}
   */
  transformFunctionDeclaration: function(tree) {
    return tree;
  },

  /**
   * @param {StateMachine} tree
   * @return {ParseTree}
   */
  transformStateMachine: function(tree) {
    return tree;
  },

  /**
   * @param {SwitchStatement} tree
   * @return {ParseTree}
   */
  transformSwitchStatement: function(tree) {
    var oldState = this.transformBreaks_;
    this.transformBreaks = false;
    var result = proto.transformSwitchStatement.call(this, tree);
    this.transformBreaks_ = oldState;
    return result;
  },

  /**
   * @param {WhileStatement} tree
   * @return {ParseTree}
   */
  transformWhileStatement: function(tree) {
    return tree;
  }
});
