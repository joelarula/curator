"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelMinAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ModelMinAggregate = class ModelMinAggregate {
};
exports.ModelMinAggregate = ModelMinAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ModelMinAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinAggregate.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinAggregate.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelMinAggregate.prototype, "source", void 0);
exports.ModelMinAggregate = ModelMinAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelMinAggregate", {})
], ModelMinAggregate);
