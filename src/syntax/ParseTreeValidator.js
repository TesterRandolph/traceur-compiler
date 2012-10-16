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

import ParseTreeType from 'trees/ParseTree.js';
import ParseTreeVisitor from 'ParseTreeVisitor.js';
import PredefinedName from 'PredefinedName.js';
import TokenType from 'TokenType.js';
import TreeWriter from '../outputgeneration/TreeWriter.js';
import createObject from '../util/util.js';
import trees from 'trees/ParseTrees.js';

var NewExpression = trees.NewExpression;

/*
TODO: add contextual information to the validator so we can check
non-local grammar rules, such as:
 * operator precedence
 * expressions with or without "in"
 * return statements must be in a function
 * break must be enclosed in loops or switches
 * continue must be enclosed in loops
 * function declarations must have non-null names
   (optional for function expressions)
*/

/**
 * Validates a parse tree
 *
 * @constructor
 * @extends {ParseTreeVisitor}
 */
export function ParseTreeValidator() {
  ParseTreeVisitor.call(this);
}

/**
 * An error thrown when an invalid parse tree is encountered. This error is
 * used internally to distinguish between errors in the Validator itself vs
 * errors it threw to unwind the call stack.
 *
 * @param {ParseTree} tree
 * @param {string} message
 * @constructor
 */
function ValidationError(tree, message) {
  this.tree = tree;
  this.message = message;
}
ValidationError.prototype = Object.create(Error.prototype);

/**
 * Validates a parse tree.  Validation failures are compiler bugs.
 * When a failure is found, the source file is dumped to standard
 * error output and a runtime exception is thrown.
 *
 * @param {ParseTree} tree
 */
ParseTreeValidator.validate = function(tree) {
  var validator = new ParseTreeValidator();
  try {
    validator.visitAny(tree);
  } catch (e) {
    if (!(e instanceof ValidationError)) {
      throw e;
    }

    var location = null;
    if (e.tree !== null) {
      location = e.tree.location;
    }
    if (location === null) {
      location = tree.location;
    }
    var locationString = location !== null ?
        location.start.toString() :
        '(unknown)';
    throw Error('Parse tree validation failure \'' + e.message + '\' at ' +
        locationString +
        ':\n\n' +
        TreeWriter.write(tree, {highlighted: e.tree, showLineNumbers: true}) +
        '\n');
  }
};

ParseTreeValidator.prototype = createObject(
    ParseTreeVisitor.prototype, {

  /**
   * @param {ParseTree} tree
   * @param {string} message
   */
  fail_: function(tree, message) {
    throw new ValidationError(tree, message);
  },

  /**
   * @param {boolean} condition
   * @param {ParseTree} tree
   * @param {string} message
   */
  check_: function(condition, tree, message) {
    if (!condition) {
      this.fail_(tree, message);
    }
  },

  /**
   * @param {boolean} condition
   * @param {ParseTree} tree
   * @param {string} message
   */
  checkVisit_: function(condition, tree, message) {
    this.check_(condition, tree, message);
    this.visitAny(tree);
  },

  /**
   * @param {ParseTreeType} type
   * @param {ParseTree} tree
   * @param {string} message
   */
  checkType_: function(type, tree, message) {
    this.checkVisit_(tree.type === type, tree, message);
  },

  /**
   * @param {ArgumentList} tree
   */
  visitArgumentList: function(tree) {
    for (var i = 0; i < tree.args.length; i++) {
      var argument = tree.args[i];
      this.checkVisit_(argument.isAssignmentOrSpread(), argument,
          'assignment or spread expected');
    }
  },

  /**
   * @param {ArrayLiteralExpression} tree
   */
  visitArrayLiteralExpression: function(tree) {
    for (var i = 0; i < tree.elements.length; i++) {
      var element = tree.elements[i];
      this.checkVisit_(element.isNull() || element.isAssignmentOrSpread(),
          element, 'assignment or spread expected');
    }
  },

  /**
   * @param {ArrayPattern} tree
   */
  visitArrayPattern: function(tree) {
    for (var i = 0; i < tree.elements.length; i++) {
      var element = tree.elements[i];
      this.checkVisit_(element === null ||
          element.type === ParseTreeType.BINDING_ELEMENT ||
          element.type == ParseTreeType.IDENTIFIER_EXPRESSION ||
          element.isLeftHandSideExpression() ||
          element.isPattern() ||
          element.isSpreadPatternElement(),
          element,
          'null, sub pattern, left hand side expression or spread expected');

      if (element && element.isSpreadPatternElement()) {
        this.check_(i === (tree.elements.length - 1), element,
            'spread in array patterns must be the last element');
      }
    }
  },

  /**
   * @param {AwaitStatement} tree
   */
  visitAwaitStatement: function(tree) {
    this.checkVisit_(tree.expression.isExpression(), tree.expression,
        'await must be expression');
  },

  /**
   * @param {BinaryOperator} tree
   */
  visitBinaryOperator: function(tree) {
    switch (tree.operator.type) {
      // assignment
      case TokenType.EQUAL:
      case TokenType.STAR_EQUAL:
      case TokenType.SLASH_EQUAL:
      case TokenType.PERCENT_EQUAL:
      case TokenType.PLUS_EQUAL:
      case TokenType.MINUS_EQUAL:
      case TokenType.LEFT_SHIFT_EQUAL:
      case TokenType.RIGHT_SHIFT_EQUAL:
      case TokenType.UNSIGNED_RIGHT_SHIFT_EQUAL:
      case TokenType.AMPERSAND_EQUAL:
      case TokenType.CARET_EQUAL:
      case TokenType.BAR_EQUAL:
        this.check_(tree.left.isLeftHandSideExpression() ||
            tree.left.isPattern(),
            tree.left,
            'left hand side expression or pattern expected');
        this.check_(tree.right.isArrowFunctionExpression(),
            tree.right,
            'assignment expression expected');
        break;

      // logical
      case TokenType.AND:
      case TokenType.OR:
      case TokenType.BAR:
      case TokenType.CARET:
      case TokenType.AMPERSAND:

      // equality
      case TokenType.EQUAL_EQUAL:
      case TokenType.NOT_EQUAL:
      case TokenType.EQUAL_EQUAL_EQUAL:
      case TokenType.NOT_EQUAL_EQUAL:

      // relational
      case TokenType.OPEN_ANGLE:
      case TokenType.CLOSE_ANGLE:
      case TokenType.GREATER_EQUAL:
      case TokenType.LESS_EQUAL:
      case TokenType.INSTANCEOF:
      case TokenType.IN:

      // shift
      case TokenType.LEFT_SHIFT:
      case TokenType.RIGHT_SHIFT:
      case TokenType.UNSIGNED_RIGHT_SHIFT:

      // additive
      case TokenType.PLUS:
      case TokenType.MINUS:

      // multiplicative
      case TokenType.STAR:
      case TokenType.SLASH:
      case TokenType.PERCENT:
        this.check_(tree.left.isArrowFunctionExpression(), tree.left,
            'assignment expression expected');
        this.check_(tree.right.isArrowFunctionExpression(), tree.right,
            'assignment expression expected');
        break;

      case TokenType.IDENTIFIER:
        var foundIsIdentifier = false;
        switch (tree.operator.value) {
          case PredefinedName.IS:
          case PredefinedName.ISNT:
            foundIsIdentifier = true;
        }
        if (foundIsIdentifier)
          break;

      default:
        this.fail_(tree, 'unexpected binary operator');
    }
    this.visitAny(tree.left);
    this.visitAny(tree.right);
  },

  /**
   * @param {BindingElement} tree
   */
  visitBindingElement: function(tree) {
    var binding = tree.binding;
    this.checkVisit_(
        binding.type == ParseTreeType.BINDING_IDENTIFIER ||
        binding.type == ParseTreeType.OBJECT_PATTERN ||
        binding.type == ParseTreeType.ARRAY_PATTERN,
        binding,
        'expected valid binding element');
    this.visitAny(tree.initializer);
  },


  /**
   * @param {Block} tree
   */
  visitBlock: function(tree) {
    for (var i = 0; i < tree.statements.length; i++) {
      var statement = tree.statements[i];
      this.checkVisit_(statement.isSourceElement(), statement,
          'statement or function declaration expected');
    }
  },

  /**
   * @param {CallExpression} tree
   */
  visitCallExpression: function(tree) {
    this.check_(tree.operand.isMemberExpression(),
                tree.operand,
                'member expression expected');
    if (tree.operand instanceof NewExpression) {
      this.check_(tree.operand.args !== null, tree.operand,
          'new args expected');
    }
    this.visitAny(tree.operand);
    this.visitAny(tree.args);
  },

  /**
   * @param {CaseClause} tree
   */
  visitCaseClause: function(tree) {
    this.checkVisit_(tree.expression.isExpression(), tree.expression,
        'expression expected');
    for (var i = 0; i < tree.statements.length; i++) {
      var statement = tree.statements[i];
      this.checkVisit_(statement.isStatement(), statement,
          'statement expected');
    }
  },

  /**
   * @param {Catch} tree
   */
  visitCatch: function(tree) {
    this.checkVisit_(tree.binding.isPattern() ||
        tree.binding.type == ParseTreeType.BINDING_IDENTIFIER,
        tree.binding, 'binding identifier expected');
    this.checkVisit_(tree.catchBody.type === ParseTreeType.BLOCK,
        tree.catchBody, 'block expected');
  },

  /**
   * @param {ClassDeclaration} tree
   */
  visitClassDeclaration: function(tree) {
    for (var i = 0; i < tree.elements.length; i++) {
      var element = tree.elements[i];
      switch (element.type) {
        case ParseTreeType.GET_ACCESSOR:
        case ParseTreeType.SET_ACCESSOR:
        case ParseTreeType.PROPERTY_METHOD_ASSIGNMENT:
          break;
        default:
          this.fail_(element, 'class element expected');
      }
      this.visitAny(element);
    }
  },

  /**
   * @param {CommaExpression} tree
   */
  visitCommaExpression: function(tree) {
    for (var i = 0; i < tree.expressions.length; i++) {
      var expression = tree.expressions[i];
      this.checkVisit_(expression.isArrowFunctionExpression(), expression,
          'expression expected');
    }
  },

  /**
   * @param {ConditionalExpression} tree
   */
  visitConditionalExpression: function(tree) {
    this.checkVisit_(tree.condition.isArrowFunctionExpression(), tree.condition,
        'expression expected');
    this.checkVisit_(tree.left.isArrowFunctionExpression(), tree.left,
        'expression expected');
    this.checkVisit_(tree.right.isArrowFunctionExpression(), tree.right,
        'expression expected');
  },

  /**
   * @param {DefaultClause} tree
   */
  visitDefaultClause: function(tree) {
    for (var i = 0; i < tree.statements.length; i++) {
      var statement = tree.statements[i];
      this.checkVisit_(statement.isStatement(), statement,
          'statement expected');
    }
  },

  /**
   * @param {DoWhileStatement} tree
   */
  visitDoWhileStatement: function(tree) {
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
    this.checkVisit_(tree.condition.isExpression(), tree.condition,
        'expression expected');
  },

  /**
   * @param {ExportDeclaration} tree
   */
  visitExportDeclaration: function(tree) {
    var declType = tree.declaration.type;
    this.checkVisit_(
        declType == ParseTreeType.VARIABLE_STATEMENT ||
        declType == ParseTreeType.FUNCTION_DECLARATION ||
        declType == ParseTreeType.MODULE_DEFINITION ||
        declType == ParseTreeType.MODULE_DECLARATION ||
        declType == ParseTreeType.CLASS_DECLARATION ||
        declType == ParseTreeType.EXPORT_MAPPING_LIST,
        tree.declaration,
        'expected valid export tree');
  },

  /**
   * @param {ExportMapping} tree
   */
  visitExportMapping: function(tree) {
    if (tree.moduleExpression) {
      this.checkVisit_(
          tree.moduleExpression.type == ParseTreeType.MODULE_EXPRESSION,
          tree.moduleExpression,
          'module expression expected');
    }

    var specifierType = tree.specifierSet.type;
    this.checkVisit_(specifierType == ParseTreeType.EXPORT_SPECIFIER_SET ||
                     specifierType == ParseTreeType.IDENTIFIER_EXPRESSION,
                     tree.specifierSet,
                     'specifier set or identifier expected');
  },

  /**
   * @param {ExportMapping} tree
   */
  visitExportMappingList: function(tree) {
    this.check_(tree.paths.length > 0, tree,
                'expected at least one path');
    for (var i = 0; i < tree.paths.length; i++) {
      var path = tree.paths[i];
      var type = path.type;
      this.checkVisit_(
          type == ParseTreeType.EXPORT_MAPPING,
          path,
          'expected export mapping');
    }
  },

  /**
   * @param {ExportSpecifierSet} tree
   */
  visitExportSpecifierSet: function(tree) {
    this.check_(tree.specifiers.length > 0, tree,
        'expected at least one identifier');
    for (var i = 0; i < tree.specifiers.length; i++) {
      var specifier = tree.specifiers[i];
      this.checkVisit_(
          specifier.type == ParseTreeType.EXPORT_SPECIFIER ||
          specifier.type == ParseTreeType.IDENTIFIER_EXPRESSION,
          specifier,
          'expected valid export specifier');
    }
  },

  /**
   * @param {ExpressionStatement} tree
   */
  visitExpressionStatement: function(tree) {
    this.checkVisit_(tree.expression.isExpression(), tree.expression,
        'expression expected');
  },

  /**
   * @param {Finally} tree
   */
  visitFinally: function(tree) {
    this.checkVisit_(tree.block.type === ParseTreeType.BLOCK, tree.block,
        'block expected');
  },

  /**
   * @param {ForOfStatement} tree
   */
  visitForOfStatement: function(tree) {
    this.checkVisit_(
      tree.initializer.isPattern() ||
      tree.initializer.type === ParseTreeType.IDENTIFIER_EXPRESSION ||
      tree.initializer.type === ParseTreeType.VARIABLE_DECLARATION_LIST &&
      tree.initializer.declarations.length === 1,
        tree.initializer,
        'for-each statement may not have more than one variable declaration');
    this.checkVisit_(tree.collection.isExpression(), tree.collection,
        'expression expected');
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
  },

  /**
   * @param {ForInStatement} tree
   */
  visitForInStatement: function(tree) {
    if (tree.initializer.type === ParseTreeType.VARIABLE_DECLARATION_LIST) {
      this.checkVisit_(
          tree.initializer.declarations.length <=
              1,
          tree.initializer,
          'for-in statement may not have more than one variable declaration');
    } else {
      this.checkVisit_(tree.initializer.isPattern() ||
                       tree.initializer.isExpression(),
                       tree.initializer,
                       'variable declaration, expression or ' +
                       'pattern expected');
    }
    this.checkVisit_(tree.collection.isExpression(), tree.collection,
        'expression expected');
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
  },

  /**
   * @param {FormalParameterList} tree
   */
  visitFormalParameterList: function(tree) {
    for (var i = 0; i < tree.parameters.length; i++) {
      var parameter = tree.parameters[i];
      switch (parameter.type) {
        case ParseTreeType.BINDING_ELEMENT:
          break;

        case ParseTreeType.REST_PARAMETER:
          this.checkVisit_(
              i === tree.parameters.length - 1, parameter,
              'rest parameters must be the last parameter in a parameter' +
              ' list');
          this.checkType_(ParseTreeType.BINDING_IDENTIFIER,
                          parameter.identifier,
                          'binding identifier expected');
          break

        default:
          this.fail_(parameter, 'parameters must be identifiers or rest' +
              ' parameters. Found: ' + parameter.type);
          break;
      }
      this.visitAny(parameter);
    }
  },

  /**
   * @param {ForStatement} tree
   */
  visitForStatement: function(tree) {
    if (tree.initializer !== null && !tree.initializer.isNull()) {
      this.checkVisit_(
          tree.initializer.isExpression() ||
          tree.initializer.type === ParseTreeType.VARIABLE_DECLARATION_LIST,
          tree.initializer,
          'variable declaration list or expression expected');
    }
    if (tree.condition !== null) {
      this.checkVisit_(tree.condition.isExpression(), tree.condition,
          'expression expected');
    }
    if (tree.increment !== null) {
      this.checkVisit_(tree.condition.isExpression(), tree.increment,
          'expression expected');
    }
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
  },

  /**
   * @param {FunctionDeclaration} tree
   */
  visitFunctionDeclaration: function(tree) {
    if (tree.name !== null) {
      this.checkType_(ParseTreeType.BINDING_IDENTIFIER,
                      tree.name,
                      'binding identifier expected');
    }
    this.checkType_(ParseTreeType.FORMAL_PARAMETER_LIST,
                    tree.formalParameterList,
                    'formal parameters expected');

    this.checkType_(ParseTreeType.BLOCK,
                    tree.functionBody,
                    'block expected');
  },

  /**
   * @param {GetAccessor} tree
   */
  visitGetAccessor: function(tree) {
    this.checkType_(ParseTreeType.BLOCK, tree.body, 'block expected');
  },

  /**
   * @param {IfStatement} tree
   */
  visitIfStatement: function(tree) {
    this.checkVisit_(tree.condition.isExpression(), tree.condition,
        'expression expected');
    this.checkVisit_(tree.ifClause.isStatement(), tree.ifClause,
        'statement expected');
    if (tree.elseClause !== null) {
      this.checkVisit_(tree.elseClause.isStatement(), tree.elseClause,
          'statement expected');
    }
  },

  /**
   * @param {LabelledStatement} tree
   */
  visitLabelledStatement: function(tree) {
    this.checkVisit_(tree.statement.isStatement(), tree.statement,
        'statement expected');
  },

  /**
   * @param {MemberExpression} tree
   */
  visitMemberExpression: function(tree) {
    this.check_(tree.operand.isMemberExpression(), tree.operand,
        'member expression expected');
    if (tree.operand instanceof NewExpression) {
      this.check_(tree.operand.args !== null, tree.operand,
          'new args expected');
    }
    this.visitAny(tree.operand);
  },

  /**
   * @param {MemberLookupExpression} tree
   */
  visitMemberLookupExpression: function(tree) {
    this.check_(tree.operand.isMemberExpression(),
                tree.operand,
                'member expression expected');
    if (tree.operand instanceof NewExpression) {
      this.check_(tree.operand.args !== null, tree.operand,
          'new args expected');
    }
    this.visitAny(tree.operand);
  },

  /**
   * @param {MissingPrimaryExpression} tree
   */
  visitMissingPrimaryExpression: function(tree) {
    this.fail_(tree, 'parse tree contains errors');
  },

  /**
   * @param {ModuleDefinition} tree
   */
  visitModuleDeclaration: function(tree) {
    for (var i = 0; i < tree.specifiers.length; i++) {
      var specifier = tree.specifiers[i];
      this.checkType_(ParseTreeType.MODULE_SPECIFIER,
                      specifier,
                      'module specifier expected');
    }
  },

  /**
   * @param {ModuleDefinition} tree
   */
  visitModuleDefinition: function(tree) {
    for (var i = 0; i < tree.elements.length; i++) {
      var element = tree.elements[i];
      this.checkVisit_(
          (element.isStatement() && element.type !== ParseTreeType.BLOCK) ||
          element.type === ParseTreeType.CLASS_DECLARATION ||
          element.type === ParseTreeType.EXPORT_DECLARATION ||
          element.type === ParseTreeType.IMPORT_DECLARATION ||
          element.type === ParseTreeType.MODULE_DEFINITION ||
          element.type === ParseTreeType.MODULE_DECLARATION,
          element,
          'module element expected');
    }
  },

  /**
   * @param {ModuleRequire} tree
   */
  visitModuleRequire: function(tree) {
    this.check_(tree.url.type == TokenType.STRING, tree.url,
                'string expected');
  },

  /**
   * @param {ModuleSpecifier} tree
   */
  visitModuleSpecifier: function(tree) {
    this.checkType_(ParseTreeType.MODULE_EXPRESSION,
                    tree.expression,
                    'module expression expected');
  },

  /**
   * @param {NewExpression} tree
   */
  visitNewExpression: function(tree) {
    this.checkVisit_(tree.operand.isMemberExpression(),
                     tree.operand,
                     'member expression expected');
    this.visitAny(tree.args);
  },

  /**
   * @param {ObjectLiteralExpression} tree
   */
  visitObjectLiteralExpression: function(tree) {
    for (var i = 0; i < tree.propertyNameAndValues.length; i++) {
      var propertyNameAndValue = tree.propertyNameAndValues[i];
      switch (propertyNameAndValue.type) {
        case ParseTreeType.GET_ACCESSOR:
        case ParseTreeType.SET_ACCESSOR:
        case ParseTreeType.PROPERTY_METHOD_ASSIGNMENT:
        case ParseTreeType.PROPERTY_NAME_ASSIGNMENT:
        case ParseTreeType.PROPERTY_NAME_SHORTHAND:
          break;
        default:
          this.fail_(propertyNameAndValue,
              'accessor, property name assignment or property method assigment expected');
      }
      this.visitAny(propertyNameAndValue);
    }
  },

  /**
   * @param {ObjectPattern} tree
   */
  visitObjectPattern: function(tree) {
    for (var i = 0; i < tree.fields.length; i++) {
      var field = tree.fields[i];
      this.checkVisit_(field.type === ParseTreeType.OBJECT_PATTERN_FIELD ||
                       field.type === ParseTreeType.BINDING_ELEMENT ||
                       field.type === ParseTreeType.IDENTIFIER_EXPRESSION,
                       field,
                       'object pattern field expected');
    }
  },

  /**
   * @param {ObjectPatternField} tree
   */
  visitObjectPatternField: function(tree) {
    this.checkVisit_(tree.element.type === ParseTreeType.BINDING_ELEMENT ||
                     tree.element.isPattern() ||
                     tree.element.isLeftHandSideExpression(),
                     tree.element,
                     'binding element expected');
  },

  /**
   * @param {ParenExpression} tree
   */
  visitParenExpression: function(tree) {
    if (tree.expression.isPattern()) {
      this.visitAny(tree.expression);
    } else {
      this.checkVisit_(tree.expression.isExpression(), tree.expression,
          'expression expected');
    }
  },

  /**
   * @param {PostfixExpression} tree
   */
  visitPostfixExpression: function(tree) {
    this.checkVisit_(tree.operand.isArrowFunctionExpression(), tree.operand,
        'assignment expression expected');
  },

  /**
   * @param {Program} tree
   */
  visitProgram: function(tree) {
    for (var i = 0; i < tree.programElements.length; i++) {
      var programElement = tree.programElements[i];
      this.checkVisit_(programElement.isProgramElement(),
          programElement,
          'global program element expected');
    }
  },

  /**
   * @param {PropertyNameAssignment} tree
   */
  visitPropertyNameAssignment: function(tree) {
    this.checkVisit_(tree.value.isArrowFunctionExpression(), tree.value,
        'assignment expression expected');
  },

  /**
   * @param {PropertyNameShorthand} tree
   */
  visitPropertyNameShorthand: function(tree) {
  },

  /**
   * @param {QuasiLiteralExpression} tree
   */
  visitQuasiLiteralExpression: function(tree) {
    if (tree.operand) {
      this.checkVisit_(tree.operand.isMemberExpression(), tree.operand,
                       'member or call expression expected');
    }

    // The elements are alternating between QuasiLiteralPortion and
    // QuasiSubstitution.
    for (var i = 0; i < tree.elements.length; i++) {
      var element = tree.elements[i];
      if (i % 2) {
        this.checkType_(ParseTreeType.QUASI_SUBSTITUTION,
                        element,
                        'Quasi substitution expected');
      } else {
        this.checkType_(ParseTreeType.QUASI_LITERAL_PORTION,
                        element,
                        'Quasi literal portion expected');

      }
    }
  },

  /**
   * @param {ReturnStatement} tree
   */
  visitReturnStatement: function(tree) {
    if (tree.expression !== null) {
      this.checkVisit_(tree.expression.isExpression(), tree.expression,
          'expression expected');
    }
  },

  /**
   * @param {SetAccessor} tree
   */
  visitSetAccessor: function(tree) {
    this.checkType_(ParseTreeType.BLOCK, tree.body, 'block expected');
  },

  /**
   * @param {SpreadExpression} tree
   */
  visitSpreadExpression: function(tree) {
    this.checkVisit_(tree.expression.isArrowFunctionExpression(),
        tree.expression,
        'assignment expression expected');
  },

  /**
   * @param {StateMachine} tree
   */
  visitStateMachine: function(tree) {
    this.fail_(tree, 'State machines are never valid outside of the ' +
        'GeneratorTransformer pass.');
  },

  /**
   * @param {SwitchStatement} tree
   */
  visitSwitchStatement: function(tree) {
    this.checkVisit_(tree.expression.isExpression(), tree.expression,
        'expression expected');
    var defaultCount = 0;
    for (var i = 0; i < tree.caseClauses.length; i++) {
      var caseClause = tree.caseClauses[i];
      if (caseClause.type === ParseTreeType.DEFAULT_CLAUSE) {
        ++defaultCount;
        this.checkVisit_(defaultCount <= 1, caseClause,
            'no more than one default clause allowed');
      } else {
        this.checkType_(ParseTreeType.CASE_CLAUSE,
                        caseClause, 'case or default clause expected');
      }
    }
  },

  /**
   * @param {ThrowStatement} tree
   */
  visitThrowStatement: function(tree) {
    if (tree.value === null) {
      return;
    }
    this.checkVisit_(tree.value.isExpression(), tree.value,
        'expression expected');
  },

  /**
   * @param {TryStatement} tree
   */
  visitTryStatement: function(tree) {
    this.checkType_(ParseTreeType.BLOCK, tree.body, 'block expected');
    if (tree.catchBlock !== null && !tree.catchBlock.isNull()) {
      this.checkType_(ParseTreeType.CATCH, tree.catchBlock,
                      'catch block expected');
    }
    if (tree.finallyBlock !== null && !tree.finallyBlock.isNull()) {
      this.checkType_(ParseTreeType.FINALLY, tree.finallyBlock,
                      'finally block expected');
    }
    if ((tree.catchBlock === null || tree.catchBlock.isNull()) &&
        (tree.finallyBlock === null || tree.finallyBlock.isNull())) {
      this.fail_(tree, 'either catch or finally must be present');
    }
  },

  /**
   * @param {UnaryExpression} tree
   */
  visitUnaryExpression: function(tree) {
    this.checkVisit_(tree.operand.isArrowFunctionExpression(), tree.operand,
        'assignment expression expected');
  },

  /**
   * @param {VariableDeclaration} tree
   */
  visitVariableDeclaration: function(tree) {
    this.checkVisit_(tree.lvalue.isPattern() ||
                     tree.lvalue.type == ParseTreeType.BINDING_IDENTIFIER,
                     tree.lvalue,
                     'binding identifier expected, found: ' + tree.lvalue.type);
    if (tree.initializer !== null) {
      this.checkVisit_(tree.initializer.isArrowFunctionExpression(),
          tree.initializer, 'assignment expression expected');
    }
  },

  /**
   * @param {WhileStatement} tree
   */
  visitWhileStatement: function(tree) {
    this.checkVisit_(tree.condition.isExpression(), tree.condition,
        'expression expected');
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
  },

  /**
   * @param {WithStatement} tree
   */
  visitWithStatement: function(tree) {
    this.checkVisit_(tree.expression.isExpression(), tree.expression,
        'expression expected');
    this.checkVisit_(tree.body.isStatement(), tree.body,
        'statement expected');
  },

  /**
   * @param {YieldStatement} tree
   */
  visitYieldStatement: function(tree) {
    if (tree.expression !== null) {
      this.checkVisit_(tree.expression.isExpression(), tree.expression,
          'expression expected');
    }
  }
});
