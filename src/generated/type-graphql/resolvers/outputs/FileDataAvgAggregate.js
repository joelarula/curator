"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataAvgAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let FileDataAvgAggregate = class FileDataAvgAggregate {
};
exports.FileDataAvgAggregate = FileDataAvgAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataAvgAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataAvgAggregate.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Float, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataAvgAggregate.prototype, "projectId", void 0);
exports.FileDataAvgAggregate = FileDataAvgAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("FileDataAvgAggregate", {})
], FileDataAvgAggregate);
