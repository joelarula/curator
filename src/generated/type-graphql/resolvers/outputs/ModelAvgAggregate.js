"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelAvgAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelAvgAggregate = class ModelAvgAggregate {
};
exports.ModelAvgAggregate = ModelAvgAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelAvgAggregate.prototype, "id", void 0);
exports.ModelAvgAggregate = ModelAvgAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelAvgAggregate", {})
], ModelAvgAggregate);
