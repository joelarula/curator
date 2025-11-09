"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelSumAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelSumAggregate = class ModelSumAggregate {
};
exports.ModelSumAggregate = ModelSumAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelSumAggregate.prototype, "id", void 0);
exports.ModelSumAggregate = ModelSumAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelSumAggregate", {})
], ModelSumAggregate);
